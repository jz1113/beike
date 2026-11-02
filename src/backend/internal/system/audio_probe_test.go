package system

import "testing"

func TestAudioProbeUsesAudioDurationAndRejectsMissingStreams(t *testing.T) {
	for _, test := range []struct {
		raw  string
		want float64
	}{
		{`{"streams":[{"codec_type":"audio","duration":"2.5"}],"format":{"duration":"8"}}`, 2.5},
		{`{"streams":[{"codec_type":"audio","duration":"N/A"}],"format":{"duration":"8"}}`, 8},
		{`{"streams":[],"format":{"duration":"8"}}`, 0},
		{`{"streams":[{"codec_type":"video"}],"format":{"duration":"8"}}`, 0},
		{`{"streams":[{"codec_type":"audio","duration":"NaN"}]}`, 0},
		{`{"streams":[{"codec_type":"audio"}],"format":{"duration":"+Inf"}}`, 0},
	} {
		got, err := parseAudioDuration([]byte(test.raw))
		if (err != nil) != (test.want == 0) || got != test.want {
			t.Errorf("probe %s: got %v, %v", test.raw, got, err)
		}
	}
}
