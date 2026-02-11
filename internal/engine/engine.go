package engine

import (
	"antigravity-rotator-v2/internal/config"
	"antigravity-rotator-v2/internal/google"
	"antigravity-rotator-v2/internal/scanner"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type RotatorEngine struct {
	Config *config.AppConfig
	Client *google.Client
	mu     sync.Mutex
	Status map[string]int // key: email:model
	ctx    context.Context
	ticker *time.Ticker
	done   chan bool
}

type AgentInfo struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	CurrentModel string `json:"currentModel"`
	Emoji        string `json:"emoji"`
}

func NewRotatorEngine(cfg *config.AppConfig) *RotatorEngine {
	return &RotatorEngine{
		Config: cfg,
		Client: &google.Client{
			Proxy: cfg.Rotator.Proxy,
		},
		Status: make(map[string]int),
		done:   make(chan bool),
	}
}

func (e *RotatorEngine) getOpenClawCmd(args ...string) *exec.Cmd {
	bin := "openclaw"
	if e.Config.Rotator.OpenClawBin != "" {
		bin = e.Config.Rotator.OpenClawBin
	}
	cmd := exec.Command(bin, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd
}

func (e *RotatorEngine) SetContext(ctx context.Context) {
	e.ctx = ctx
}

func (e *RotatorEngine) emitStatus() {
	if e.ctx != nil {
		runtime.EventsEmit(e.ctx, "status_updated", e.Status)
	}
}

func (e *RotatorEngine) StartAutoLoop() {
	if e.Config.Rotator.AutoRotate && e.Config.Rotator.RotateInterval > 0 {
		e.StopAutoLoop() // Ensure no duplicate loops
		e.ticker = time.NewTicker(time.Duration(e.Config.Rotator.RotateInterval) * time.Minute)
		go func() {
			for {
				select {
				case <-e.done:
					return
				case <-e.ticker.C:
					fmt.Println("Auto-Rotation Triggered")
					e.RunCycle()
				}
			}
		}()
		fmt.Printf("Auto-rotation started every %d minutes\n", e.Config.Rotator.RotateInterval)
	}
}

func (e *RotatorEngine) StopAutoLoop() {
	if e.ticker != nil {
		e.ticker.Stop()
		e.ticker = nil
		// Non-blocking send
		select {
		case e.done <- true:
		default:
		}
		fmt.Println("Auto-rotation stopped")
	}
}

func (e *RotatorEngine) getPaths() (string, string) {
	home, _ := os.UserHomeDir()
	// Priority: agents/main/agent/auth-profiles.json then ~/.openclaw/auth-profiles.json
	mainAgentAuth := filepath.Join(home, ".openclaw", "agents", "main", "agent", "auth-profiles.json")
	if _, err := os.Stat(mainAgentAuth); err == nil {
		return mainAgentAuth, filepath.Join(home, ".openclaw", "openclaw.json")
	}
	return filepath.Join(home, ".openclaw", "auth-profiles.json"), filepath.Join(home, ".openclaw", "openclaw.json")
}

func (e *RotatorEngine) SyncAuthToAgents(sourcePath string) error {
	workspaces, err := scanner.ScanWorkspaces()
	if err != nil {
		return err
	}

	data, err := os.ReadFile(sourcePath)
	if err != nil {
		return err
	}

	for _, wp := range workspaces {
		target := filepath.Join(wp.Path, "auth-profiles.json")
		absTarget, _ := filepath.Abs(target)
		absSource, _ := filepath.Abs(sourcePath)
		if absTarget == absSource {
			continue
		}
		os.WriteFile(target, data, 0644)
	}
	return nil
}

type accountTask struct {
	email     string
	refresh   string
	projectId string
}

func (e *RotatorEngine) RefreshStatus() error {
	authPath, _ := e.getPaths()
	authData, err := e.readJSON(authPath)
	if err != nil {
		return fmt.Errorf("读取凭据失败: %v", err)
	}

	accounts := e.Config.Rotator.Accounts
	if len(accounts) == 0 {
		return nil
	}

	profiles, ok := authData["profiles"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("profiles 字段不存在")
	}

	var tasks []accountTask
	for _, email := range accounts {
		profileKey := "google-antigravity:" + email
		if profile, ok := profiles[profileKey].(map[string]interface{}); ok {
			refresh, _ := profile["refresh"].(string)
			projectId, _ := profile["projectId"].(string)
			if refresh != "" {
				tasks = append(tasks, accountTask{email: email, refresh: refresh, projectId: projectId})
			}
		}
	}

	var wg sync.WaitGroup
	var statusMu sync.Mutex

	for _, task := range tasks {
		wg.Add(1)
		go func(t accountTask) {
			defer wg.Done()

			newAccess, err := e.Client.RefreshAccessToken(t.refresh)
			if err != nil {
				return
			}

			pId := t.projectId
			if pId == "" {
				pId, err = e.Client.FetchProjectID(newAccess)
				if err != nil {
					return
				}
				// 这种按需更新 projectId 的逻辑暂不写回文件以保证线程安全，仅本次刷新使用
			}

			quotas, err := e.Client.FetchAccountQuota(newAccess, pId)
			if err != nil {
				return
			}

			statusMu.Lock()
			for model, q := range quotas {
				e.Status[t.email+":"+model] = q
			}
			statusMu.Unlock()
			e.emitStatus()
		}(task)
	}

	wg.Wait()
	e.emitStatus()
	return nil
}

func (e *RotatorEngine) GetConfigHash() (string, error) {
	cmd := e.getOpenClawCmd("gateway", "call", "config.get", "--json")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("获取配置 Hash 失败: %v", err)
	}

	// 过滤非 JSON 输出（例如插件加载日志）
	outputStr := string(output)
	jsonStart := strings.Index(outputStr, "{")
	if jsonStart == -1 {
		return "", fmt.Errorf("未在输出中找到 JSON 数据: %s", outputStr)
	}
	outputStr = outputStr[jsonStart:]

	var res struct {
		Hash string `json:"hash"`
	}
	if err := json.Unmarshal([]byte(outputStr), &res); err != nil {
		return "", fmt.Errorf("解析配置 Hash 失败: %v (原始内容: %s)", err, outputStr)
	}
	return res.Hash, nil
}

func (e *RotatorEngine) PatchConfig(patch string) error {
	hash, err := e.GetConfigHash()
	if err != nil {
		return err
	}

	params := fmt.Sprintf(`{"raw":%q, "baseHash":%q, "restartDelayMs":100}`, patch, hash)
	cmd := e.getOpenClawCmd("gateway", "call", "config.patch", "--params", params)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("执行 config.patch 失败: %v (输出: %s)", err, string(output))
	}
	return nil
}

func (e *RotatorEngine) RunCycle() string {
	e.mu.Lock()
	defer e.mu.Unlock()

	// 1. Refresh Status
	e.RefreshStatus()

	// 2. Define Priority Models
	priorityModels := []string{
		"google-antigravity/gemini-3-pro-high",
		"google-antigravity/gemini-3-flash",
		"google-antigravity/claude-sonnet-4-5-thinking",
	}

	threshold := e.Config.Rotator.Quotas.Low
	
	// 3. Find Best Model & Account
	for _, modelID := range priorityModels {
		bestAccount := ""
		maxQuota := -1

		for _, email := range e.Config.Rotator.Accounts {
			key := email + ":" + modelID
			if q, ok := e.Status[key]; ok {
				if q > maxQuota {
					maxQuota = q
					bestAccount = email
				}
			}
		}

		// If this model has a healthy account (above threshold), switch to it!
		if maxQuota > threshold {
			fmt.Printf("Deep Rotation: Switching to %s on %s (Quota: %d%%)\n", modelID, bestAccount, maxQuota)
			
			// Switch Model (logic from SwitchModel)
			e.mu.Unlock() // avoid deadlock as SwitchModel takes lock
			errModel := e.SwitchModel(modelID)
			e.mu.Lock()
			if errModel != nil {
				return fmt.Sprintf("Error switching model: %v", errModel)
			}

			// Switch Account (logic from SwitchAccount)
			e.mu.Unlock()
			errAcc := e.SwitchAccount(bestAccount)
			e.mu.Lock()
			if errAcc != nil {
				return fmt.Sprintf("Error switching account: %v", errAcc)
			}

			return fmt.Sprintf("Switched to %s (%d%%)", modelID, maxQuota)
		}
	}

	return "No healthy models found above threshold"
}

func (e *RotatorEngine) SwitchModel(modelID string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	// 1. Prepare base patch for defaults
	patchObj := map[string]interface{}{
		"agents": map[string]interface{}{
			"defaults": map[string]interface{}{
				"model": map[string]interface{}{
					"primary": modelID,
				},
			},
		},
	}

	// 2. Fetch current config to identify agents to override
	cmd := e.getOpenClawCmd("gateway", "call", "config.get", "--json")
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("Failed to get config for patching: %v", err)
	}

	outputStr := string(output)
	jsonStart := strings.Index(outputStr, "{")
	if jsonStart == -1 {
		return fmt.Errorf("Invalid config output (no JSON start found)")
	}

	var ocData map[string]interface{}
	if err := json.Unmarshal([]byte(outputStr[jsonStart:]), &ocData); err != nil {
		return fmt.Errorf("Failed to parse config JSON: %v", err)
	}

	if config, ok := ocData["config"].(map[string]interface{}); ok {
		if agents, ok := config["agents"].(map[string]interface{}); ok {
			if list, ok := agents["list"].([]interface{}); ok {
				agentListPatch := make([]interface{}, len(list))
				for i, a := range list {
					agentMap, ok := a.(map[string]interface{})
					if !ok {
						agentListPatch[i] = a
						continue
					}

					// Check if the agent has a model override
					shouldPatch := false
					if m, ok := agentMap["model"]; ok && m != nil {
						// Be aggressive: if there is a model override, update it.
						// This handles both string and object formats.
						shouldPatch = true
					}

					if shouldPatch {
						newAgent := make(map[string]interface{})
						for k, v := range agentMap {
							newAgent[k] = v
						}
						// Update model to match the format it was in (string or object)
						if mObj, ok := agentMap["model"].(map[string]interface{}); ok {
							// Clone the map to avoid mutating the original if we were reusing it
							newModelObj := make(map[string]interface{})
							for k, v := range mObj {
								newModelObj[k] = v
							}
							newModelObj["primary"] = modelID
							newAgent["model"] = newModelObj
						} else {
							newAgent["model"] = modelID
						}
						agentListPatch[i] = newAgent
					} else {
						agentListPatch[i] = a
					}
				}
				patchObj["agents"].(map[string]interface{})["list"] = agentListPatch
			}
		}
	}

	patchBytes, _ := json.Marshal(patchObj)
	return e.PatchConfig(string(patchBytes))
}

func (e *RotatorEngine) SwitchAccount(email string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	profileKey := "google-antigravity:" + email

	// Deep patch to ensure auth.order is updated correctly
	patchObj := map[string]interface{}{
		"auth": map[string]interface{}{
			"order": map[string]interface{}{
				"google-antigravity": []string{profileKey},
			},
		},
	}

	// Fetch current order to preserve other accounts
	cmd := e.getOpenClawCmd("gateway", "call", "config.get", "--json")
	output, err := cmd.Output()
	if err == nil {
		outputStr := string(output)
		jsonStart := strings.Index(outputStr, "{")
		if jsonStart != -1 {
			var ocData map[string]interface{}
			if err := json.Unmarshal([]byte(outputStr[jsonStart:]), &ocData); err == nil {
				if config, ok := ocData["config"].(map[string]interface{}); ok {
					if auth, ok := config["auth"].(map[string]interface{}); ok {
						if order, ok := auth["order"].(map[string]interface{}); ok {
							if gaOrder, ok := order["google-antigravity"].([]interface{}); ok {
								newOrder := []string{profileKey}
								for _, p := range gaOrder {
									if ps, ok := p.(string); ok && ps != profileKey {
										newOrder = append(newOrder, ps)
									}
								}
								patchObj["auth"].(map[string]interface{})["order"].(map[string]interface{})["google-antigravity"] = newOrder
							}
						}
					}
				}
			}
		}
	}

	patchBytes, _ := json.Marshal(patchObj)
	return e.PatchConfig(string(patchBytes))
}

func (e *RotatorEngine) ImportAccounts(input []struct {
	Email        string `json:"email"`
	RefreshToken string `json:"refresh_token"`
}) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	authPath, _ := e.getPaths()
	authData, err := e.readJSON(authPath)
	if err != nil {
		return fmt.Errorf("读取凭据失败: %v", err)
	}

	profiles, ok := authData["profiles"].(map[string]interface{})
	if !ok {
		profiles = make(map[string]interface{})
		authData["profiles"] = profiles
	}

	updated := false
	for _, item := range input {
		if item.Email == "" || item.RefreshToken == "" {
			continue
		}

		profileKey := "google-antigravity:" + item.Email
		profile, _ := profiles[profileKey].(map[string]interface{})
		if profile == nil {
			profile = make(map[string]interface{})
			profile["provider"] = "google-antigravity"
			profile["type"] = "oauth"
			profiles[profileKey] = profile
		}

		profile["email"] = item.Email
		profile["refresh"] = item.RefreshToken
		updated = true

		exists := false
		for _, acc := range e.Config.Rotator.Accounts {
			if acc == item.Email {
				exists = true
				break
			}
		}
		if !exists {
			e.Config.Rotator.Accounts = append(e.Config.Rotator.Accounts, item.Email)
		}
	}

	if updated {
		if err := e.writeJSON(authPath, authData); err != nil {
			return fmt.Errorf("保存凭据失败: %v", err)
		}
		if err := config.SaveConfig(e.Config); err != nil {
			return fmt.Errorf("保存配置失败: %v", err)
		}
		e.SyncAuthToAgents(authPath)
	}

	return nil
}

func (e *RotatorEngine) GetVipEmail() string {
	cmd := e.getOpenClawCmd("gateway", "call", "config.get", "--json")
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	var ocData map[string]interface{}
	json.Unmarshal(output, &ocData)

	if config, ok := ocData["config"].(map[string]interface{}); ok {
		if auth, ok := config["auth"].(map[string]interface{}); ok {
			if order, ok := auth["order"].(map[string]interface{}); ok {
				if gaOrder, ok := order["google-antigravity"].([]interface{}); ok && len(gaOrder) > 0 {
					if first, ok := gaOrder[0].(string); ok {
						return strings.TrimPrefix(first, "google-antigravity:")
					}
				}
			}
		}
	}
	return ""
}

func (e *RotatorEngine) RestartGateway() {
	cmd := e.getOpenClawCmd("gateway", "restart")
	cmd.Run()
}

func (e *RotatorEngine) GetAgents() []AgentInfo {
	cmd := e.getOpenClawCmd("gateway", "call", "config.get", "--json")
	output, err := cmd.Output()
	if err != nil {
		return []AgentInfo{}
	}

	outputStr := string(output)
	jsonStart := strings.Index(outputStr, "{")
	if jsonStart == -1 {
		return []AgentInfo{}
	}

	var ocData map[string]interface{}
	if err := json.Unmarshal([]byte(outputStr[jsonStart:]), &ocData); err != nil {
		return []AgentInfo{}
	}

	var agents []AgentInfo
	if config, ok := ocData["config"].(map[string]interface{}); ok {
		if ags, ok := config["agents"].(map[string]interface{}); ok {
			if list, ok := ags["list"].([]interface{}); ok {
				for _, a := range list {
					if am, ok := a.(map[string]interface{}); ok {
						info := AgentInfo{
							ID:   am["id"].(string),
							Name: am["name"].(string),
						}
						
						// Extract Model
						if m, ok := am["model"].(string); ok {
							info.CurrentModel = m
						} else if m, ok := am["model"].(map[string]interface{}); ok {
							if p, ok := m["primary"].(string); ok {
								info.CurrentModel = p
							}
						}

						// Extract Identity Emoji
						if idty, ok := am["identity"].(map[string]interface{}); ok {
							if e, ok := idty["emoji"].(string); ok {
								info.Emoji = e
							}
						}

						agents = append(agents, info)
					}
				}
			}
		}
	}
	return agents
}

func (e *RotatorEngine) readJSON(path string) (map[string]interface{}, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var res map[string]interface{}
	err = json.Unmarshal(data, &res)
	return res, err
}

func (e *RotatorEngine) writeJSON(path string, data interface{}) error {
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, bytes, 0644)
}
