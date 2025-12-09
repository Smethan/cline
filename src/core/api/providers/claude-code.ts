import { query } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeModelId, claudeCodeDefaultModelId, claudeCodeModels } from "@/shared/api"
import { ClineStorageMessage } from "@/shared/messages/content"
import { type ApiHandler, CommonApiHandlerOptions } from ".."
import { withRetry } from "../retry"
import { type ApiStream, ApiStreamTextChunk, ApiStreamThinkingChunk, ApiStreamUsageChunk } from "../transform/stream"

// All SDK tools to disable - Cline handles tools via XML in system prompt
const DISABLED_TOOLS = [
	"Task",
	"Bash",
	"BashOutput",
	"KillShell",
	"Glob",
	"Grep",
	"LS",
	"Read",
	"Edit",
	"MultiEdit",
	"Write",
	"NotebookRead",
	"NotebookEdit",
	"WebFetch",
	"WebSearch",
	"TodoRead",
	"TodoWrite",
	"AgentOutputTool",
	"AskUserQuestion",
	"SlashCommand",
	"Skill",
	"EnterPlanMode",
	"ExitPlanMode",
]

interface ClaudeCodeHandlerOptions extends CommonApiHandlerOptions {
	cwd: string
	claudeCodePath?: string
	apiModelId?: string
	thinkingBudgetTokens?: number
}

/**
 * ClaudeCodeHandler - Direct integration with Claude Agent SDK
 *
 * Uses the SDK's query() function directly instead of spawning a subprocess.
 * All SDK tools are disabled - Cline handles tools via XML in the system prompt.
 * Requires Claude CLI login via `claude login` to authenticate.
 */
export class ClaudeCodeHandler implements ApiHandler {
	private options: ClaudeCodeHandlerOptions
	private sessionId: string | null = null
	private aborted = false

	constructor(options: ClaudeCodeHandlerOptions) {
		this.options = options
	}

	@withRetry({
		maxRetries: 4,
		baseDelay: 2000,
		maxDelay: 15000,
	})
	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[]): ApiStream {
		this.aborted = false

		const response = query({
			prompt: this.formatPrompt(messages),
			options: {
				model: this.getModel().id,
				cwd: this.options.cwd,
				systemPrompt,
				disallowedTools: DISABLED_TOOLS,
				permissionMode: "bypassPermissions",
				settingSources: [],
				maxThinkingTokens: this.options.thinkingBudgetTokens || undefined,
				// Custom CLI path if provided
				pathToClaudeCodeExecutable: this.options.claudeCodePath || undefined,
				// Resume session if we have one
				...(this.sessionId && { resume: this.sessionId }),
			},
		})

		const usage: ApiStreamUsageChunk = {
			type: "usage",
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		}

		try {
			for await (const message of response) {
				// Check for abort
				if (this.aborted) {
					break
				}

				switch (message.type) {
					case "system":
						if (message.subtype === "init" && message.session_id) {
							this.sessionId = message.session_id
						}
						break

					case "assistant":
						// Check for errors on assistant message
						if (message.error) {
							throw new Error(`Claude Agent SDK error: ${message.error}`)
						}
						// Process content blocks from assistant messages
						for (const chunk of this.extractContent(message)) {
							yield chunk
						}
						break

					case "stream_event":
						// Handle streaming deltas for real-time output
						for (const chunk of this.extractStreamEvent(message)) {
							yield chunk
						}
						break

					case "result":
						// Query completed - check for errors
						if (message.subtype !== "success") {
							const errorResult = message as { errors: string[]; subtype: string }
							throw new Error(`Claude Agent SDK error: ${errorResult.errors?.join(", ") || errorResult.subtype}`)
						}
						// Extract usage data
						if (message.usage) {
							usage.inputTokens = message.usage.input_tokens || 0
							usage.outputTokens = message.usage.output_tokens || 0
							usage.cacheReadTokens = message.usage.cache_read_input_tokens || 0
							usage.cacheWriteTokens = message.usage.cache_creation_input_tokens || 0
						}
						break
				}
			}

			// Yield final usage
			yield usage
		} catch (error) {
			this.cleanup()
			throw error
		}
	}

	/**
	 * Extract content chunks from an assistant message
	 */
	private *extractContent(message: any): Generator<ApiStreamTextChunk | ApiStreamThinkingChunk> {
		const content = message.message?.content || message.content
		if (typeof content === "string") {
			yield { type: "text" as const, text: content }
		} else if (Array.isArray(content)) {
			for (const block of content) {
				if (block.type === "text" && block.text) {
					yield { type: "text" as const, text: block.text }
				} else if (block.type === "thinking" && block.thinking) {
					yield { type: "reasoning" as const, reasoning: block.thinking }
				}
			}
		}
	}

	/**
	 * Extract content from stream events for real-time streaming
	 */
	private *extractStreamEvent(message: any): Generator<ApiStreamTextChunk | ApiStreamThinkingChunk> {
		const event = message.event
		if (!event) {
			return
		}

		// Handle content block deltas
		if (event.type === "content_block_delta" && event.delta) {
			const delta = event.delta
			if (delta.type === "text_delta" && delta.text) {
				yield { type: "text" as const, text: delta.text }
			} else if (delta.type === "thinking_delta" && delta.thinking) {
				yield { type: "reasoning" as const, reasoning: delta.thinking }
			}
		}
	}

	/**
	 * Format Cline messages into a prompt string for the SDK
	 * The SDK expects a string prompt - conversation history is handled via session resume
	 */
	private formatPrompt(messages: ClineStorageMessage[]): string {
		// Get the last user message as the prompt
		// Previous context is maintained via session resume
		const lastMsg = messages[messages.length - 1]
		if (!lastMsg) {
			return ""
		}

		if (typeof lastMsg.content === "string") {
			return lastMsg.content
		}

		if (Array.isArray(lastMsg.content)) {
			const textParts: string[] = []
			for (const block of lastMsg.content) {
				if (block.type === "text") {
					textParts.push(block.text)
				} else if (block.type === "tool_result") {
					// Include tool results in the prompt
					const content =
						typeof block.content === "string"
							? block.content
							: Array.isArray(block.content)
								? block.content.map((c: any) => (c.type === "text" ? c.text : "")).join("\n")
								: ""
					textParts.push(`[Tool Result for ${block.tool_use_id}]:\n${content}`)
				}
			}
			return textParts.join("\n\n")
		}

		return ""
	}

	private cleanup() {
		this.aborted = false
	}

	abort() {
		this.aborted = true
		// Breaking the async iterator loop will stop the query
		// Session can be resumed later if needed
	}

	getModel() {
		const modelId = this.options.apiModelId
		if (modelId && modelId in claudeCodeModels) {
			const id = modelId as ClaudeCodeModelId
			return { id, info: claudeCodeModels[id] }
		}

		return {
			id: claudeCodeDefaultModelId,
			info: claudeCodeModels[claudeCodeDefaultModelId],
		}
	}
}
