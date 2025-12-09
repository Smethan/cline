import { claudeCliAuthService } from "@/services/auth/claude-cli"
import type { Controller } from ".."

/**
 * Check Claude CLI login status and update state.
 *
 * This is called on startup to determine if the user has a valid
 * Claude CLI session for use with the Claude Code provider.
 */
export async function checkClaudeCliLogin(controller: Controller): Promise<void> {
	try {
		// Get the configured Claude Code path if any
		const claudeCodePath = controller.stateManager.getGlobalSettingsKey("claudeCodePath")

		// Check login status
		const status = await claudeCliAuthService.checkLoginStatus(claudeCodePath)

		// Update state
		controller.stateManager.setGlobalState("claudeCliLoggedIn", status.isLoggedIn)
		controller.stateManager.setGlobalState("claudeCliAccountEmail", status.email)
	} catch (error) {
		console.error("Failed to check Claude CLI login status:", error)
		// Set to undefined on error - UI will show unknown state
		controller.stateManager.setGlobalState("claudeCliLoggedIn", undefined)
		controller.stateManager.setGlobalState("claudeCliAccountEmail", undefined)
	}
}
