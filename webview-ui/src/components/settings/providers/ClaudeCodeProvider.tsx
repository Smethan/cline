import { claudeCodeModels } from "@shared/api"
import { Mode } from "@shared/storage/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { VSC_DESCRIPTION_FOREGROUND } from "@/utils/vscStyles"
import { DebouncedTextField } from "../common/DebouncedTextField"
import { ModelInfoView } from "../common/ModelInfoView"
import { ModelSelector } from "../common/ModelSelector"
import ThinkingBudgetSlider from "../ThinkingBudgetSlider"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"
import { SUPPORTED_ANTHROPIC_THINKING_MODELS } from "./AnthropicProvider"

/**
 * Props for the ClaudeCodeProvider component
 */
interface ClaudeCodeProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The Claude Code provider configuration component
 * Requires Claude CLI login via `claude login` to authenticate.
 */
export const ClaudeCodeProvider = ({ showModelOptions, isPopup, currentMode }: ClaudeCodeProviderProps) => {
	const { apiConfiguration } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	// Get the normalized configuration
	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)

	// Claude CLI login status (from claude login session)
	const claudeCliLoggedIn = apiConfiguration?.claudeCliLoggedIn
	const claudeCliAccountEmail = apiConfiguration?.claudeCliAccountEmail

	return (
		<div>
			{/* Claude CLI login status box */}
			<div className="mb-3 p-3 rounded border border-input-border bg-input-background">
				{claudeCliLoggedIn ? (
					<div>
						<div className="flex items-center gap-2 mb-2">
							<span style={{ color: "var(--vscode-terminal-ansiGreen)" }}>✓</span>
							<span>
								Claude CLI logged in
								{claudeCliAccountEmail && ` as ${claudeCliAccountEmail}`}
							</span>
						</div>
						<p className="text-sm" style={{ color: VSC_DESCRIPTION_FOREGROUND }}>
							Using your Claude Pro/Max subscription via Claude CLI session.
						</p>
					</div>
				) : (
					<div>
						<div className="flex items-center gap-2 mb-2">
							<span style={{ color: "var(--vscode-terminal-ansiYellow)" }}>⚠</span>
							<span>Claude CLI not logged in</span>
						</div>
						<p className="text-sm" style={{ color: VSC_DESCRIPTION_FOREGROUND }}>
							Run{" "}
							<code
								style={{
									backgroundColor: "var(--vscode-textCodeBlock-background)",
									padding: "2px 4px",
									borderRadius: "3px",
								}}>
								claude login
							</code>{" "}
							in your terminal to authenticate with your Claude Pro/Max subscription.
						</p>
					</div>
				)}
			</div>

			<DebouncedTextField
				initialValue={apiConfiguration?.claudeCodePath || ""}
				onChange={(value) => handleFieldChange("claudeCodePath", value)}
				placeholder="Default: claude"
				style={{ width: "100%", marginTop: 3 }}
				type="text">
				<span style={{ fontWeight: 500 }}>Claude Code CLI Path</span>
			</DebouncedTextField>

			<p
				style={{
					fontSize: "12px",
					marginTop: 3,
					color: "var(--vscode-descriptionForeground)",
				}}>
				Path to the Claude Code CLI. Leave empty to use the default.
			</p>

			{showModelOptions && (
				<>
					<ModelSelector
						label="Model"
						models={claudeCodeModels}
						onChange={(e: any) =>
							handleModeFieldChange(
								{ plan: "planModeApiModelId", act: "actModeApiModelId" },
								e.target.value,
								currentMode,
							)
						}
						selectedModelId={selectedModelId}
					/>

					{(selectedModelId === "sonnet" || selectedModelId === "opus") && (
						<p
							style={{
								fontSize: "12px",
								marginBottom: 2,
								marginTop: 2,
								color: "var(--vscode-descriptionForeground)",
							}}>
							Use the latest version of {selectedModelId} by default.
						</p>
					)}

					{SUPPORTED_ANTHROPIC_THINKING_MODELS.includes(selectedModelId) && (
						<ThinkingBudgetSlider currentMode={currentMode} maxBudget={selectedModelInfo.thinkingConfig?.maxBudget} />
					)}

					<ModelInfoView isPopup={isPopup} modelInfo={selectedModelInfo} selectedModelId={selectedModelId} />
				</>
			)}
		</div>
	)
}
