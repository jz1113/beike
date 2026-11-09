package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"time"
)

var collectionLocks [256]chan struct{}

func init() {
	for index := range collectionLocks {
		collectionLocks[index] = make(chan struct{}, 1)
	}
}

// LockCollection serializes cache misses within this API process.
func LockCollection(ctx context.Context, identity string) (string, func(), error) {
	digest := sha256.Sum256([]byte(identity))
	lock := collectionLocks[digest[0]]
	select {
	case lock <- struct{}{}:
		return hex.EncodeToString(digest[:]), func() { <-lock }, ctx.Err()
	case <-ctx.Done():
		return "", func() {}, ctx.Err()
	}
}

func LoadCollection(ctx context.Context, db *sql.DB, key string, value any) (bool, error) {
	var payload []byte
	err := db.QueryRowContext(ctx, `SELECT "payload" FROM "CollectionCache" WHERE "key" = ? AND ("expiresAt" = 0 OR "expiresAt" > ?)`, key, time.Now().Unix()).Scan(&payload)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	err = json.Unmarshal(payload, value)
	return err == nil, err
}

func SaveCollection(ctx context.Context, db *sql.DB, key string, value any, ttl time.Duration) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	var expiry int64
	if ttl > 0 {
		expiry = time.Now().Add(ttl).Unix()
	}
	_, err = db.ExecContext(ctx, `INSERT INTO "CollectionCache" ("key", "payload", "expiresAt") VALUES (?, ?, ?)
		ON CONFLICT ("key") DO UPDATE SET "payload" = excluded."payload", "expiresAt" = excluded."expiresAt"`, key, string(payload), expiry)
	return err
}
