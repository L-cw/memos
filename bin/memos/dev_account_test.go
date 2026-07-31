package main

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	"github.com/usememos/memos/server/profile"
	"github.com/usememos/memos/store"
	"github.com/usememos/memos/store/db"
)

func newAccountTestStore(t *testing.T, mode string) (*profile.Profile, *store.Store) {
	t.Helper()
	instanceProfile := &profile.Profile{
		Mode:   mode,
		Data:   t.TempDir(),
		Driver: "sqlite",
	}
	require.NoError(t, instanceProfile.Validate())
	driver, err := db.NewDBDriver(instanceProfile)
	require.NoError(t, err)
	storeInstance := store.New(driver, instanceProfile)
	t.Cleanup(func() { require.NoError(t, storeInstance.Close()) })
	require.NoError(t, storeInstance.Migrate(context.Background()))
	return instanceProfile, storeInstance
}

func TestEnsureDefaultDevAccount(t *testing.T) {
	ctx := context.Background()
	instanceProfile, storeInstance := newAccountTestStore(t, "dev")

	require.NoError(t, ensureDefaultDevAccount(ctx, instanceProfile, storeInstance))
	username := defaultDevUsername
	user, err := storeInstance.GetUser(ctx, &store.FindUser{Username: &username})
	require.NoError(t, err)
	require.NotNil(t, user)
	require.Equal(t, store.RoleHost, user.Role)
	require.NoError(t, bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(defaultDevPassword)))

	passwordHash := user.PasswordHash
	require.NoError(t, ensureDefaultDevAccount(ctx, instanceProfile, storeInstance))
	user, err = storeInstance.GetUser(ctx, &store.FindUser{Username: &username})
	require.NoError(t, err)
	require.Equal(t, passwordHash, user.PasswordHash)
}

func TestEnsureDefaultDevAccountDoesNotRunInProd(t *testing.T) {
	ctx := context.Background()
	instanceProfile, storeInstance := newAccountTestStore(t, "prod")

	require.NoError(t, ensureDefaultDevAccount(ctx, instanceProfile, storeInstance))
	username := defaultDevUsername
	user, err := storeInstance.GetUser(ctx, &store.FindUser{Username: &username})
	require.NoError(t, err)
	require.Nil(t, user)
}

func TestEnsureDefaultDevAccountPromotesExistingUserWithoutResettingProfile(t *testing.T) {
	ctx := context.Background()
	instanceProfile, storeInstance := newAccountTestStore(t, "dev")
	passwordHash, err := bcrypt.GenerateFromPassword([]byte("existing-password"), bcrypt.DefaultCost)
	require.NoError(t, err)

	_, err = storeInstance.CreateUser(ctx, &store.User{
		Username:     "existing-host",
		Nickname:     "Existing Host",
		Role:         store.RoleHost,
		PasswordHash: string(passwordHash),
	})
	require.NoError(t, err)
	existingUser, err := storeInstance.CreateUser(ctx, &store.User{
		Username:     defaultDevUsername,
		Nickname:     "Keep This Nickname",
		Role:         store.RoleUser,
		PasswordHash: string(passwordHash),
	})
	require.NoError(t, err)

	require.NoError(t, ensureDefaultDevAccount(ctx, instanceProfile, storeInstance))
	username := defaultDevUsername
	user, err := storeInstance.GetUser(ctx, &store.FindUser{Username: &username})
	require.NoError(t, err)
	require.Equal(t, existingUser.ID, user.ID)
	require.Equal(t, store.RoleHost, user.Role)
	require.Equal(t, "Keep This Nickname", user.Nickname)
	require.Equal(t, string(passwordHash), user.PasswordHash)
	require.NoError(t, bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte("existing-password")))
}

func TestAccountTestStoreUsesIsolatedDatabase(t *testing.T) {
	instanceProfile, _ := newAccountTestStore(t, "dev")
	require.Equal(t, filepath.Join(instanceProfile.Data, "memos_dev.db"), instanceProfile.DSN)
}
