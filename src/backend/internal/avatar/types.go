package avatar

import (
	"time"
)

type Character struct {
	ID              string    `json:"id"`
	WorkspaceID     string    `json:"workspaceId"`
	Name            string    `json:"name"`
	Type            int       `json:"type"`   // 0: 系统预设, 1: 自定义克隆
	Status          int       `json:"status"` // 0: 训练中, 1: 可用, 2: 失败
	StatusMsg       string    `json:"statusMsg"`
	VideoURL        string    `json:"videoUrl"`
	CoverURL        string    `json:"coverUrl"`
	CoverWidth      int       `json:"coverWidth"`
	CoverHeight     int       `json:"coverHeight"`
	AudioPromptURL  string    `json:"audioPromptUrl"`
	WelcomeVideoURL string    `json:"welcomeVideoUrl"`
	HumanID         string    `json:"humanId"`
	Description     string    `json:"description"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type Voice struct {
	ID             string    `json:"id"`
	WorkspaceID    string    `json:"workspaceId"`
	Name           string    `json:"name"`
	Type           int       `json:"type"`   // 0: 系统预设, 1: 自定义克隆
	Status         int       `json:"status"` // 0: 训练中, 1: 可用, 2: 失败
	StatusMsg      string    `json:"statusMsg"`
	AudioURL       string    `json:"audioUrl"`
	PromptNpyURL   string    `json:"promptNpyUrl"`
	PromptText     string    `json:"promptText"`
	SampleAudioURL string    `json:"sampleAudioUrl"`
	VoiceID        string    `json:"voiceId"`
	Gender         string    `json:"gender"`
	Tags           []string  `json:"tags"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type Font struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Nickname   string `json:"nickname"`
	FontURL    string `json:"fontUrl"`
	PreviewURL string `json:"previewUrl"`
}

type VideoTask struct {
	ID              string     `json:"id"`
	WorkspaceID     string     `json:"workspaceId"`
	Title           string     `json:"title"`
	ScriptContent   string     `json:"scriptContent"`
	Layout          int        `json:"layout"`     // 1: 横屏(16:9), 2: 竖屏(9:16)
	Resolution      int        `json:"resolution"` // 1: 480p, 2: 720p, 3: 1080p, 4: 2k, 5: 4k
	FrameRate       int        `json:"frameRate"`  // 1: 25fps, 2: 30fps, 3: 50fps, 4: 60fps
	ExportFormat    string     `json:"exportFormat"`
	AvatarID        string     `json:"avatarId"`
	AvatarPosition  string     `json:"avatarPosition"`
	AvatarScale     float64    `json:"avatarScale"`
	VoiceID         string     `json:"voiceId"`
	VoiceSpeed      float64    `json:"voiceSpeed"`
	VoiceVolume     float64    `json:"voiceVolume"`
	BgType          string     `json:"bgType"`
	BgColor         string     `json:"bgColor"`
	BgMediaURL      string     `json:"bgMediaUrl"`
	SubtitleEnabled bool       `json:"subtitleEnabled"`
	FontID          string     `json:"fontId"`
	FontSize        int        `json:"fontSize"`
	FontColor       string     `json:"fontColor"`
	FontPosition    string     `json:"fontPosition"`
	Status          int        `json:"status"`   // 0: 排队生成中, 1: 已完成, 2: 失败
	Progress        int        `json:"progress"` // 0 ~ 100
	CurrentStage    string     `json:"currentStage"`
	StatusMsg       string     `json:"statusMsg"`
	VideoURL        string     `json:"videoUrl"`
	CoverURL        string     `json:"coverUrl"`
	Duration        float64    `json:"duration"`
	Error           string     `json:"error"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
	FinishedAt      *time.Time `json:"finishedAt,omitempty"`
}

type CreateCharacterRequest struct {
	Name        string `json:"name"`
	VideoURL    string `json:"videoUrl"`
	CoverURL    string `json:"coverUrl"`
	MediaKind   string `json:"mediaKind"`
	Description string `json:"description"`
}

type CreateVoiceRequest struct {
	Name       string   `json:"name"`
	AudioURL   string   `json:"audioUrl"`
	PromptText string   `json:"promptText"`
	Gender     string   `json:"gender"`
	Tags       []string `json:"tags"`
	Provider   string   `json:"provider"`
	Model      string   `json:"model"`
	BaseURL    string   `json:"baseUrl"`
	APIKey     string   `json:"apiKey"`
}

type RenderVideoRequest struct {
	Title           string  `json:"title"`
	ScriptContent   string  `json:"scriptContent"`
	Layout          int     `json:"layout"` // 1: 横屏, 2: 竖屏
	Resolution      int     `json:"resolution"`
	FrameRate       int     `json:"frameRate"`
	ExportFormat    string  `json:"exportFormat"`
	AvatarID        string  `json:"avatarId"`
	AvatarPosition  string  `json:"avatarPosition"`
	AvatarScale     float64 `json:"avatarScale"`
	VoiceID         string  `json:"voiceId"`
	VoiceSpeed      float64 `json:"voiceSpeed"`
	VoiceVolume     float64 `json:"voiceVolume"`
	BgType          string  `json:"bgType"`
	BgColor         string  `json:"bgColor"`
	BgMediaURL      string  `json:"bgMediaUrl"`
	SubtitleEnabled bool    `json:"subtitleEnabled"`
	FontID          string  `json:"fontId"`
	FontSize        int     `json:"fontSize"`
	FontColor       string  `json:"fontColor"`
	FontPosition    string  `json:"fontPosition"`
	Model           string  `json:"voiceModel"`
	LipsyncModel    string  `json:"videoModel"`
	CustomBaseURL   string  `json:"customBaseUrl"`
	CustomAPIKey    string  `json:"customApiKey"`
	VoiceBaseURL    string  `json:"voiceBaseUrl"`
	VoiceAPIKey     string  `json:"voiceApiKey"`
	DriverBaseURL   string  `json:"driverBaseUrl"`
	DriverAPIKey    string  `json:"driverApiKey"`
	DriveMode       string  `json:"driveMode"`
}
