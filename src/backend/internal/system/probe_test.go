package system

import "testing"

func TestParseProbeReadsVideoStream(t *testing.T) {
	probe, err := parseProbe([]byte(`{"streams":[{"codec_type":"audio"},{"codec_type":"video","width":1920,"height":1080,"avg_frame_rate":"30000/1001"}],"format":{"duration":"1.5"}}`))
	if err != nil {
		t.Fatal(err)
	}
	if probe.Width != 1920 || probe.Height != 1080 || probe.Duration != 1.5 || !probe.HasAudio || probe.FPS < 29 || probe.FPS > 30 {
		t.Fatalf("probe %+v", probe)
	}
	silent, err := parseProbe([]byte(`{"streams":[{"codec_type":"video","width":720,"height":1280,"avg_frame_rate":"24/1"}],"format":{"duration":"4"}}`))
	if err != nil || silent.HasAudio {
		t.Fatalf("silent probe %+v %v", silent, err)
	}
	if _, err := parseProbe([]byte(`{"streams":[{"codec_type":"audio"}]}`)); err == nil || err.Error() != "未在视频中找到视频流" {
		t.Fatalf("missing video %v", err)
	}
}
