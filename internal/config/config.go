package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type RotatorConfig struct {
	Accounts      []string `json:"accounts"`
	ModelPriority []string `json:"modelPriority"`
	Quotas        struct {
		Low int `json:"low"`
	} `json:"quotas"`
	AutoRotate     bool `json:"autoRotate"`
	RotateInterval int  `json:"rotateInterval"` // in minutes
	OpenClawBin    string `json:"openclawBin"`
	Proxy          string `json:"proxy"`
}

type AppConfig struct {
	Rotator RotatorConfig `json:"rotator"`
	LastScan []string      `json:"lastScan"`
}

func GetConfigPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".openclaw", "antigravity-rotator-v2.json")
}

func LoadConfig() (*AppConfig, error) {
	path := GetConfigPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		// Default config
		cfg := &AppConfig{}
		cfg.Rotator.Quotas.Low = 21
		cfg.Rotator.ModelPriority = []string{"google-antigravity/gemini-3-pro-high", "google-antigravity/gemini-3-flash"}
		return cfg, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg AppConfig
	err = json.Unmarshal(data, &cfg)
	return &cfg, err
}

func SaveConfig(cfg *AppConfig) error {
	path := GetConfigPath()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}
