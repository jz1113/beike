package sales

import (
	"bytes"
	"encoding/binary"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
)

type studioBgm struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	MoodTags           []string `json:"moodTags"`
	BPM                int      `json:"bpm"`
	DurationSec        float64  `json:"durationSec"`
	SuitableCategories []string `json:"suitableCategories"`
	License            string   `json:"license"`
	AudioURL           string   `json:"audioUrl"`
	Source             string   `json:"source,omitempty"`
	Editable           bool     `json:"editable"`
	chords             [][3]float64
	padGain            float64
	pulseGain          float64
}

var builtinStudioBgms = []studioBgm{
	{
		ID:                 "bgm_french_lazy",
		Title:              "午后法式暖阳 · 原声电钢",
		Description:        "柔和爵士七和弦与轻呼吸律动，适合松弛感穿搭、家居与护肤旁白垫底",
		MoodTags:           []string{"法式慵懒", "优雅", "松弛", "时尚", "轻柔", "生活"},
		BPM:                86,
		DurationSec:        12,
		SuitableCategories: []string{"fashion", "beauty", "home"},
		License:            "CC0-1.0 / 贝壳内置免版税商用",
		AudioURL:           "/api/sales/bgm/bgm_french_lazy",
		chords:             [][3]float64{{261.63, 329.63, 392.00}, {220.00, 261.63, 329.63}, {293.66, 349.23, 440.00}, {196.00, 246.94, 349.23}},
		padGain:            0.20,
		pulseGain:          0.08,
	},
	{
		ID:                 "bgm_street_beat",
		Title:              "城市街拍轻律动 · 节奏垫底",
		Description:        "明快不抢人声的现代街拍律动，适合一镜到底真人口播与户外服饰种草",
		MoodTags:           []string{"轻快街拍", "自信", "欢快", "弱鼓点垫底", "元气种草"},
		BPM:                112,
		DurationSec:        12,
		SuitableCategories: []string{"fashion", "other", "food"},
		License:            "CC0-1.0 / 贝壳内置免版税商用",
		AudioURL:           "/api/sales/bgm/bgm_street_beat",
		chords:             [][3]float64{{293.66, 369.99, 440.00}, {246.94, 293.66, 369.99}, {196.00, 246.94, 293.66}, {220.00, 277.18, 329.63}},
		padGain:            0.16,
		pulseGain:          0.16,
	},
	{
		ID:                 "bgm_warm_home",
		Title:              "清晨原木居家 · 治愈分解和弦",
		Description:        "温暖干净的原声分解音色，适合日用百货、美食冲调与母婴生活展示",
		MoodTags:           []string{"治愈", "温暖", "清新", "自然", "日常"},
		BPM:                94,
		DurationSec:        12,
		SuitableCategories: []string{"home", "food", "beauty"},
		License:            "CC0-1.0 / 贝壳内置免版税商用",
		AudioURL:           "/api/sales/bgm/bgm_warm_home",
		chords:             [][3]float64{{349.23, 440.00, 523.25}, {329.63, 392.00, 493.88}, {293.66, 349.23, 440.00}, {261.63, 329.63, 392.00}},
		padGain:            0.18,
		pulseGain:          0.10,
	},
	{
		ID:                 "bgm_tech_clean",
		Title:              "极简数字脉冲 · 科技开箱",
		Description:        "克制利落的现代电子泛音，适合 3C 数码、家电功能卖点与参数拆解",
		MoodTags:           []string{"极简", "科技", "专业", "现代", "利落"},
		BPM:                106,
		DurationSec:        12,
		SuitableCategories: []string{"tech", "home", "other"},
		License:            "CC0-1.0 / 贝壳内置免版税商用",
		AudioURL:           "/api/sales/bgm/bgm_tech_clean",
		chords:             [][3]float64{{220.00, 329.63, 440.00}, {196.00, 293.66, 392.00}, {174.61, 261.63, 349.23}, {196.00, 293.66, 440.00}},
		padGain:            0.15,
		pulseGain:          0.15,
	},
	{
		ID:                 "bgm_upbeat_pop",
		Title:              "高能好物开场 · 明亮节拍",
		Description:        "阳光积极的轻流行节拍，适合快节奏卖点展示与高转化种草短视频",
		MoodTags:           []string{"元气", "高能", "种草", "快节奏", "明亮"},
		BPM:                120,
		DurationSec:        12,
		SuitableCategories: []string{"beauty", "food", "fashion", "other"},
		License:            "CC0-1.0 / 贝壳内置免版税商用",
		AudioURL:           "/api/sales/bgm/bgm_upbeat_pop",
		chords:             [][3]float64{{329.63, 415.30, 493.88}, {246.94, 311.13, 369.99}, {277.18, 329.63, 415.30}, {220.00, 277.18, 329.63}},
		padGain:            0.17,
		pulseGain:          0.18,
	},
}

var (
	zeroTime   time.Time
	bgmCacheMu sync.Mutex
	bgmCache   = map[string][]byte{}
)

func lookupBuiltinBgm(id string) (studioBgm, bool) {
	clean := strings.TrimSuffix(strings.TrimSpace(id), ".wav")
	for _, item := range builtinStudioBgms {
		if item.ID == clean {
			return item, true
		}
	}
	return studioBgm{}, false
}

func renderBuiltinBgmWAV(track studioBgm) []byte {
	bgmCacheMu.Lock()
	if cached, ok := bgmCache[track.ID]; ok {
		bgmCacheMu.Unlock()
		return cached
	}
	bgmCacheMu.Unlock()

	const sampleRate = 24000
	totalSamples := int(track.DurationSec * sampleRate)
	pcm := make([]int16, totalSamples)
	beatSec := 60.0 / float64(track.BPM)
	chordSpan := track.DurationSec / float64(len(track.chords))

	for i := 0; i < totalSamples; i++ {
		t := float64(i) / sampleRate
		chordIdx := int(t/chordSpan) % len(track.chords)
		chord := track.chords[chordIdx]
		localChordT := math.Mod(t, chordSpan)
		chordEnv := math.Min(1.0, localChordT/0.08) * math.Exp(-localChordT*0.35)

		pad := (math.Sin(2*math.Pi*chord[0]*t) +
			0.75*math.Sin(2*math.Pi*chord[1]*t) +
			0.6*math.Sin(2*math.Pi*chord[2]*t)) / 2.35 * track.padGain * (0.55 + 0.45*chordEnv)

		beatPos := math.Mod(t, beatSec)
		beatIdx := int(t/beatSec) % 3
		arpFreq := chord[beatIdx] * 2
		arpEnv := math.Min(1.0, beatPos/0.015) * math.Exp(-beatPos*5.5)
		arp := math.Sin(2*math.Pi*arpFreq*t) * track.pulseGain * arpEnv

		bassEnv := math.Min(1.0, beatPos/0.01) * math.Exp(-beatPos*7.0)
		bass := math.Sin(2*math.Pi*(chord[0]*0.5)*t) * (track.pulseGain * 0.65) * bassEnv

		fade := 1.0
		if t < 0.08 {
			fade = t / 0.08
		} else if remain := track.DurationSec - t; remain < 0.15 {
			fade = math.Max(0, remain/0.15)
		}
		sample := (pad + arp + bass) * fade
		if sample > 0.92 {
			sample = 0.92
		} else if sample < -0.92 {
			sample = -0.92
		}
		pcm[i] = int16(sample * 32767)
	}

	var buf bytes.Buffer
	dataSize := uint32(len(pcm) * 2)
	buf.WriteString("RIFF")
	_ = binary.Write(&buf, binary.LittleEndian, uint32(36)+dataSize)
	buf.WriteString("WAVEfmt ")
	_ = binary.Write(&buf, binary.LittleEndian, uint32(16))
	_ = binary.Write(&buf, binary.LittleEndian, uint16(1))
	_ = binary.Write(&buf, binary.LittleEndian, uint16(1))
	_ = binary.Write(&buf, binary.LittleEndian, uint32(sampleRate))
	_ = binary.Write(&buf, binary.LittleEndian, uint32(sampleRate*2))
	_ = binary.Write(&buf, binary.LittleEndian, uint16(2))
	_ = binary.Write(&buf, binary.LittleEndian, uint16(16))
	buf.WriteString("data")
	_ = binary.Write(&buf, binary.LittleEndian, dataSize)
	_ = binary.Write(&buf, binary.LittleEndian, pcm)

	wav := buf.Bytes()
	bgmCacheMu.Lock()
	bgmCache[track.ID] = wav
	bgmCacheMu.Unlock()
	return wav
}

// BuiltinBgmAudio streams zero-copyright built-in BGM WAV loops for preview and post-production.
func BuiltinBgmAudio() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		track, ok := lookupBuiltinBgm(r.PathValue("id"))
		if !ok {
			http.NotFound(w, r)
			return
		}
		wav := renderBuiltinBgmWAV(track)
		w.Header().Set("Content-Type", "audio/wav")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		http.ServeContent(w, r, track.ID+".wav", zeroTime, bytes.NewReader(wav))
	}
}
