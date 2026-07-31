package main

import (
	"context"
	"fmt"
	"log/slog"

	"golang.org/x/crypto/bcrypt"

	"github.com/usememos/memos/server/profile"
	"github.com/usememos/memos/store"
)

const (
	defaultDevUsername = "qqq"
	defaultDevPassword = "qqq11111"
)

func ensureDefaultDevAccount(ctx context.Context, instanceProfile *profile.Profile, storeInstance *store.Store) error {
	if instanceProfile.Mode != "dev" {
		return nil
	}

	username := defaultDevUsername
	existingUser, err := storeInstance.GetUser(ctx, &store.FindUser{Username: &username})
	if err != nil {
		return fmt.Errorf("find development account: %w", err)
	}
	if existingUser != nil {
		if existingUser.Role == store.RoleHost {
			return nil
		}

		hostRole := store.RoleHost
		if _, err := storeInstance.UpdateUser(ctx, &store.UpdateUser{
			ID:   existingUser.ID,
			Role: &hostRole,
		}); err != nil {
			return fmt.Errorf("promote development account to host: %w", err)
		}
		slog.Info("promoted default development account to host", "username", defaultDevUsername)
		return nil
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(defaultDevPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash development account password: %w", err)
	}
	if _, err := storeInstance.CreateUser(ctx, &store.User{
		Username:     defaultDevUsername,
		Nickname:     defaultDevUsername,
		Role:         store.RoleHost,
		PasswordHash: string(passwordHash),
	}); err != nil {
		return fmt.Errorf("create development account: %w", err)
	}

	slog.Info("created default development account", "username", defaultDevUsername)
	return nil
}
