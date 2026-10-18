package generate

import (
	"strings"
	"testing"
)

func TestSpeechFamilyRouting(t *testing.T) {
	if speechFamily("speech-2.8-hd") != "minimax" || speechFamily("eleven_multilingual_v2") != "elevenlabs" {
		t.Fatal("family names")
	}
	if speechFamily("cosyvoice-v2") != "cosyvoice" || speechFamily("doubao-tts") != "doubao" || speechFamily("tts-1") != "openai" {
		t.Fatal("family names")
	}
	attempts := speechAttempts(SpeechRequest{Base: "https://gw.example", Model: "speech-2.8-hd", Text: "你好", Voice: "female"})
	if len(attempts) != 2 || !strings.Contains(attempts[0].Endpoint, "/v1/t2a_v2") || !strings.Contains(attempts[1].Endpoint, "/v1/audio/speech") {
		t.Fatalf("minimax attempts %#v", attempts)
	}
	eleven := speechAttempts(SpeechRequest{Base: "https://gw.example", Model: "eleven_multilingual_v2", Text: "hi", Voice: "voice_1"})
	if !strings.Contains(eleven[0].Endpoint, "/v1/text-to-speech/voice_1") {
		t.Fatalf("eleven endpoint %s", eleven[0].Endpoint)
	}
}
