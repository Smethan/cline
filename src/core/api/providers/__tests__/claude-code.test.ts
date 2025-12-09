import { afterEach, beforeEach, describe, it } from "mocha"
import sinon from "sinon"
import "should"
import { ClaudeCodeHandler } from "@core/api/providers/claude-code"
import { ClineStorageMessage } from "@/shared/messages/content"

describe("ClaudeCodeHandler", () => {
	let handler: ClaudeCodeHandler
	let sandbox: sinon.SinonSandbox

	beforeEach(() => {
		sandbox = sinon.createSandbox()
		handler = new ClaudeCodeHandler({
			cwd: "/mock/cwd",
			claudeCodePath: "/mock/path",
			apiModelId: "claude-opus-4-1-20250805",
		})
	})

	afterEach(() => {
		sandbox.restore()
	})

	describe("token counting", () => {
		// Note: These tests are skipped because the Claude Agent SDK exports are
		// non-configurable and can't be stubbed. Integration tests cover this functionality.
		it.skip("should correctly handle token usage from SDK result messages", async () => {
			// The new SDK-based implementation uses query() from @anthropic-ai/claude-agent-sdk
			// and extracts usage from the result message

			// Mock the query function
			const sdkModule = await import("@anthropic-ai/claude-agent-sdk")
			const queryStub = sandbox.stub(sdkModule, "query")

			// Create a proper async generator mock for the SDK response
			async function* mockGenerator() {
				// First yield the system init
				yield {
					type: "system",
					subtype: "init",
					session_id: "test-session-123",
				}

				// Yield assistant message with content
				yield {
					type: "assistant",
					message: {
						content: [
							{
								type: "text",
								text: "Test response",
							},
						],
					},
				}

				// Yield result with usage data
				yield {
					type: "result",
					subtype: "success",
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_read_input_tokens: 20,
						cache_creation_input_tokens: 10,
					},
				}
			}

			queryStub.returns(mockGenerator() as any)

			const systemPrompt = "You are a helpful assistant."
			const messages: ClineStorageMessage[] = [{ role: "user", content: "Hello" }]

			const usageData: any[] = []

			// Collect the results
			for await (const chunk of handler.createMessage(systemPrompt, messages)) {
				if (chunk.type === "usage") {
					usageData.push({
						inputTokens: chunk.inputTokens,
						outputTokens: chunk.outputTokens,
						cacheReadTokens: chunk.cacheReadTokens,
						cacheWriteTokens: chunk.cacheWriteTokens,
					})
				}
			}

			// Verify token counting
			usageData.should.have.length(1)
			usageData[0].should.deepEqual({
				inputTokens: 100,
				outputTokens: 50,
				cacheReadTokens: 20,
				cacheWriteTokens: 10,
			})
		})

		it.skip("should handle missing usage fields with default values", async () => {
			// Mock the query function
			const sdkModule = await import("@anthropic-ai/claude-agent-sdk")
			const queryStub = sandbox.stub(sdkModule, "query")

			// Create a proper async generator mock with missing usage fields
			async function* mockGenerator() {
				yield {
					type: "result",
					subtype: "success",
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						// cache fields are undefined/missing
					},
				}
			}

			queryStub.returns(mockGenerator() as any)

			const systemPrompt = "You are a helpful assistant."
			const messages: ClineStorageMessage[] = [{ role: "user", content: "Hello" }]

			const usageData: any[] = []

			// Collect the results
			for await (const chunk of handler.createMessage(systemPrompt, messages)) {
				if (chunk.type === "usage") {
					usageData.push({
						inputTokens: chunk.inputTokens,
						outputTokens: chunk.outputTokens,
						cacheReadTokens: chunk.cacheReadTokens,
						cacheWriteTokens: chunk.cacheWriteTokens,
					})
				}
			}

			// Verify that undefined cache tokens default to 0
			usageData.should.have.length(1)
			usageData[0].should.deepEqual({
				inputTokens: 100,
				outputTokens: 50,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
			})
		})
	})

	describe("getModel", () => {
		it("should return the correct model when specified", () => {
			const handler = new ClaudeCodeHandler({
				cwd: "/mock/cwd",
				apiModelId: "claude-sonnet-4-5-20250929",
			})

			const model = handler.getModel()
			model.id.should.equal("claude-sonnet-4-5-20250929")
		})

		it("should return default model when not specified", () => {
			const handler = new ClaudeCodeHandler({
				cwd: "/mock/cwd",
			})

			const model = handler.getModel()
			// The default model should be set
			model.id.should.be.type("string")
			model.info.should.be.type("object")
		})
	})
})
