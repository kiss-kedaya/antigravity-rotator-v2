package scanner

import (
	"os"
	"path/filepath"
)

type WorkspaceInfo struct {
	Path            string `json:"path"`
	HasConfig       bool   `json:"hasConfig"`
	HasAuthProfiles bool   `json:"hasAuthProfiles"`
}

func ScanWorkspaces() ([]WorkspaceInfo, error) {
	home, _ := os.UserHomeDir()
	basePath := filepath.Join(home, ".openclaw")
	
	var workspaces []WorkspaceInfo

	// Check main workspace
	mainWp := WorkspaceInfo{Path: basePath}
	if _, err := os.Stat(filepath.Join(basePath, "openclaw.json")); err == nil {
		mainWp.HasConfig = true
	}
	if _, err := os.Stat(filepath.Join(basePath, "auth-profiles.json")); err == nil {
		mainWp.HasAuthProfiles = true
	}
	if mainWp.HasConfig || mainWp.HasAuthProfiles {
		workspaces = append(workspaces, mainWp)
	}

	// Check agent workspaces
	agentsPath := filepath.Join(basePath, "agents")
	if _, err := os.Stat(agentsPath); err == nil {
		entries, _ := os.ReadDir(agentsPath)
		for _, entry := range entries {
			if entry.IsDir() {
				agentPath := filepath.Join(agentsPath, entry.Name(), "agent")
				wp := WorkspaceInfo{Path: agentPath}
				if _, err := os.Stat(filepath.Join(agentPath, "openclaw.json")); err == nil {
					wp.HasConfig = true
				}
				if _, err := os.Stat(filepath.Join(agentPath, "auth-profiles.json")); err == nil {
					wp.HasAuthProfiles = true
				}
				if wp.HasConfig || wp.HasAuthProfiles {
					workspaces = append(workspaces, wp)
				}
			}
		}
	}

	return workspaces, nil
}
