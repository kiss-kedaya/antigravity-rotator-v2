package google

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	quotaAPIURL    = "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels"
	loadProjectURL = "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist"
)

type Client struct {
	Proxy        string
	ClientID     string
	ClientSecret string
}

func (c *Client) getHttpClient() *http.Client {
	proxyStr := c.Proxy
	if proxyStr == "" {
		proxyStr = "http://127.0.0.1:7890"
	}
	proxyURL, _ := url.Parse(proxyStr)
	
	transport := &http.Transport{
		Proxy: http.ProxyURL(proxyURL),
		// 优化连接稳定性
		DisableKeepAlives: true,
	}

	return &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
	}
}

// QuotaResponse matches the actual API response format from daily-cloudcode-pa
type QuotaResponse struct {
	Models map[string]ModelInfo `json:"models"`
}

type ModelInfo struct {
	QuotaInfo *QuotaInfo `json:"quotaInfo"`
}

type QuotaInfo struct {
	RemainingFraction float64 `json:"remainingFraction"`
	ResetTime         string  `json:"resetTime"`
}

type LoadProjectResponse struct {
	CloudaicompanionProject interface{} `json:"cloudaicompanionProject"`
}

func (c *Client) RefreshAccessToken(refreshToken string) (string, error) {
	clientID := c.ClientID
	if clientID == "" {
		clientID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
	}
	clientSecret := c.ClientSecret
	if clientSecret == "" {
		clientSecret = "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"
	}

	data := url.Values{}
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)
	data.Set("refresh_token", refreshToken)
	data.Set("grant_type", "refresh_token")

	resp, err := c.getHttpClient().PostForm("https://oauth2.googleapis.com/token", data)
	if err != nil {
		return "", fmt.Errorf("Google 认证请求失败: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("OAuth 状态异常 %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("无法解析 OAuth 响应: %v (原始响应: %s)", err, string(body))
	}

	if result.Error != "" {
		return "", fmt.Errorf("Google OAuth 错误: %s", result.Error)
	}

	return result.AccessToken, nil
}

// FetchProjectID dynamically fetches the project ID via loadCodeAssist
func (c *Client) FetchProjectID(accessToken string) (string, error) {
	payload, _ := json.Marshal(map[string]interface{}{
		"metadata": map[string]string{"ideType": "ANTIGRAVITY"},
	})

	req, _ := http.NewRequest("POST", loadProjectURL, bytes.NewBuffer(payload))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.getHttpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("loadCodeAssist 请求失败: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("loadCodeAssist 响应异常 %d: %s", resp.StatusCode, string(body))
	}

	var result LoadProjectResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("无法解析 loadCodeAssist 响应: %v", err)
	}

	if result.CloudaicompanionProject == nil {
		return "", fmt.Errorf("未获取到 cloudaicompanionProject")
	}

	switch v := result.CloudaicompanionProject.(type) {
	case string:
		return v, nil
	case map[string]interface{}:
		if id, ok := v["id"].(string); ok {
			return id, nil
		}
	}

	return "", fmt.Errorf("无法识别的 projectId 格式")
}

// FetchAccountQuota fetches the model quota for an account using the correct API
func (c *Client) FetchAccountQuota(accessToken, projectId string) (map[string]int, error) {
	payload, _ := json.Marshal(map[string]string{"project": projectId})

	req, _ := http.NewRequest("POST", quotaAPIURL, bytes.NewBuffer(payload))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "antigravity/1.15.8 linux/x64")

	resp, err := c.getHttpClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("配额 API 请求失败: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("配额 API 响应异常 %d: %s", resp.StatusCode, string(body))
	}

	var raw QuotaResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("无法解析配额数据: %v", err)
	}

	quotas := make(map[string]int)
	for name, info := range raw.Models {
		if info.QuotaInfo == nil {
			continue
		}

		var displayName string
		nameLower := strings.ToLower(name)

		if strings.Contains(nameLower, "gemini-3-pro") {
			displayName = "google-antigravity/gemini-3-pro-high"
		} else if strings.Contains(nameLower, "gemini-3-flash") {
			displayName = "google-antigravity/gemini-3-flash"
		} else if strings.Contains(nameLower, "gemini-3-image") {
			displayName = "google-antigravity/gemini-3-image"
		} else if strings.Contains(nameLower, "claude") && strings.Contains(nameLower, "thinking") {
			displayName = "google-antigravity/claude-sonnet-4-5-thinking"
		} else {
			continue 
		}

		percentage := int(info.QuotaInfo.RemainingFraction * 100)
		if current, exists := quotas[displayName]; !exists || percentage < current {
			quotas[displayName] = percentage
		}
	}

	log.Printf("[Google] 获取到 %d 个模型配额", len(quotas))
	return quotas, nil
}
