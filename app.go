package main

import (
	"antigravity-rotator-v2/internal/config"
	"antigravity-rotator-v2/internal/engine"
	"antigravity-rotator-v2/internal/scanner"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx    context.Context
	cfg    *config.AppConfig
	engine *engine.RotatorEngine
}

// NewApp creates a new App application struct
func NewApp() *App {
	cfg, _ := config.LoadConfig()
	return &App{
		cfg:    cfg,
		engine: engine.NewRotatorEngine(cfg),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.engine.SetContext(ctx)
	// Start auto-rotation on startup if enabled
	a.engine.StartAutoLoop()
}

// GetWorkspaces returns all detected OpenClaw workspaces
func (a *App) GetWorkspaces() []scanner.WorkspaceInfo {
	ws, _ := scanner.ScanWorkspaces()
	return ws
}

// GetAgents returns the list of configured agents and their models
func (a *App) GetAgents() []engine.AgentInfo {
	return a.engine.GetAgents()
}

// GetConfig returns the current application configuration
func (a *App) GetConfig() config.AppConfig {
	return *a.cfg
}

// SaveConfig saves the configuration
func (a *App) SaveConfig(cfg config.AppConfig) string {
	a.cfg = &cfg
	err := config.SaveConfig(a.cfg)
	if err != nil {
		return fmt.Sprintf("Error: %v", err)
	}
	// Restart loop if config changed
	a.engine.StartAutoLoop()
	return "Success"
}

// RunRotation triggers a rotation cycle manually
func (a *App) RunRotation() string {
	return a.engine.RunCycle()
}

// GetAccountStatus returns the current quota status from the engine
func (a *App) GetAccountStatus() map[string]int {
	// 触发配额刷新
	_ = a.engine.RefreshStatus()
	return a.engine.Status
}

// ImportAccounts imports a batch of accounts from a JSON string
func (a *App) ImportAccounts(jsonStr string) string {
	var input []struct {
		Email        string `json:"email"`
		RefreshToken string `json:"refresh_token"`
	}
	err := json.Unmarshal([]byte(jsonStr), &input)
	if err != nil {
		return fmt.Sprintf("Error: 解析 JSON 失败: %v", err)
	}

	err = a.engine.ImportAccounts(input)
	if err != nil {
		return fmt.Sprintf("Error: %v", err)
	}

	return "Success"
}

// SwitchModel manually switches the active model
func (a *App) SwitchModel(modelID string) string {
	err := a.engine.SwitchModel(modelID)
	if err != nil {
		return fmt.Sprintf("Error: %v", err)
	}
	return "Success"
}

// SwitchAccount manually switches the active account
func (a *App) SwitchAccount(email string) string {
	err := a.engine.SwitchAccount(email)
	if err != nil {
		return fmt.Sprintf("Error: %v", err)
	}
	return "Success"
}

func (a *App) GetVipEmail() string {
	return a.engine.GetVipEmail()
}

// SelectFile opens a file dialog to select a JSON file and returns its content
func (a *App) SelectFile() (string, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Accounts JSON",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files", Pattern: "*.json"},
		},
	})
	if err != nil {
		return "", err
	}
	if selection == "" {
		return "", nil // User cancelled
	}

	data, err := ioutil.ReadFile(selection)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// StartAutoRotation enables and starts the auto-rotation loop
func (a *App) StartAutoRotation(interval int) {
	a.cfg.Rotator.AutoRotate = true
	a.cfg.Rotator.RotateInterval = interval
	a.engine.StartAutoLoop()
	config.SaveConfig(a.cfg)
}

// StopAutoRotation disables the auto-rotation loop
func (a *App) StopAutoRotation() {
	a.cfg.Rotator.AutoRotate = false
	a.engine.StopAutoLoop()
	config.SaveConfig(a.cfg)
}
