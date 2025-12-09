import { query } from "@anthropic-ai/claude-agent-sdk"

export interface ClaudeCliLoginStatus {
	isLoggedIn: boolean
	email?: string
}

/**
 * Service for checking Claude CLI authentication status.
 *
 * The Claude Agent SDK uses the Claude CLI's authentication session stored in
 * the system keychain. This service attempts a minimal SDK query to verify
 * if authentication is valid.
 */
export class ClaudeCliAuthService {
	/**
	 * Check if the user is logged in via Claude CLI.
	 *
	 * Attempts a minimal query with immediate abort to check if authentication
	 * is valid without actually completing a full request.
	 */
	async checkLoginStatus(claudeCodePath?: string): Promise<ClaudeCliLoginStatus> {
		try {
			// Attempt a minimal query to verify authentication
			// We abort immediately after getting the init message
			const response = query({
				prompt: "ping",
				options: {
					model: "claude-sonnet-4-5",
					maxTurns: 1,
					permissionMode: "bypassPermissions",
					settingSources: [],
					disallowedTools: ["Task", "Bash", "Read", "Write", "Edit", "Glob", "Grep"],
					...(claudeCodePath && { pathToClaudeCodeExecutable: claudeCodePath }),
				},
			})

			// Process just enough to verify authentication works
			for await (const message of response) {
				if (message.type === "system" && message.subtype === "init") {
					// Authentication succeeded - we got an init message
					// The SDK doesn't expose account email, so we just confirm logged in
					return {
						isLoggedIn: true,
						email: undefined,
					}
				}

				// If we get any response at all, auth worked
				if (message.type === "assistant" || message.type === "result") {
					return {
						isLoggedIn: true,
						email: undefined,
					}
				}
			}

			// If we got here without error, assume logged in
			return {
				isLoggedIn: true,
				email: undefined,
			}
		} catch (error) {
			// Check for authentication-specific errors
			const errorMessage = error instanceof Error ? error.message : String(error)

			// Common authentication error patterns
			if (
				errorMessage.includes("not logged in") ||
				errorMessage.includes("authentication") ||
				errorMessage.includes("AUTHENTICATION_FAILED") ||
				errorMessage.includes("login") ||
				errorMessage.includes("unauthorized")
			) {
				return {
					isLoggedIn: false,
					email: undefined,
				}
			}

			// For other errors (network, etc.), assume not logged in
			console.error("Claude CLI auth check error:", errorMessage)
			return {
				isLoggedIn: false,
				email: undefined,
			}
		}
	}
}

// Singleton instance
export const claudeCliAuthService = new ClaudeCliAuthService()
