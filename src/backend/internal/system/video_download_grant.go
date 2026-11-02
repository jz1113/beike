package system

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

type videoDirectoryGrant struct {
	owner, directory string
	expires          time.Time
}

var videoDirectoryGrants = struct {
	sync.Mutex
	items map[string]videoDirectoryGrant
}{items: map[string]videoDirectoryGrant{}}

// Only a directory selected through the native picker becomes a writable root.
// Grants are memory-only; stale remembered paths must be selected again.
func grantVideoDirectory(owner, directory string) (string, error) {
	cleaned, err := cleanVideoDirectory(directory)
	if err != nil {
		return "", err
	}
	var nonce [32]byte
	if _, err = rand.Read(nonce[:]); err != nil {
		return "", err
	}
	token := hex.EncodeToString(nonce[:])
	videoDirectoryGrants.Lock()
	defer videoDirectoryGrants.Unlock()
	now := time.Now()
	for id, grant := range videoDirectoryGrants.items {
		if now.After(grant.expires) {
			delete(videoDirectoryGrants.items, id)
		}
	}
	if len(videoDirectoryGrants.items) >= 128 {
		return "", errors.New("保存位置授权过多，请稍后重试")
	}
	videoDirectoryGrants.items[token] = videoDirectoryGrant{owner, cleaned, now.Add(8 * time.Hour)}
	return token, nil
}

func hasVideoDirectoryGrant(owner, directory, token string) bool {
	videoDirectoryGrants.Lock()
	defer videoDirectoryGrants.Unlock()
	grant, ok := videoDirectoryGrants.items[token]
	return ok && grant.owner == owner && grant.directory == directory && time.Now().Before(grant.expires)
}
