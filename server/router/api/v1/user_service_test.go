package v1

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
	teststore "github.com/usememos/memos/test/store"
)

func TestUpdateUserRoleRequiresHost(t *testing.T) {
	ctx := context.Background()
	ts := teststore.NewTestingStore(ctx, t)
	t.Cleanup(func() {
		require.NoError(t, ts.Close())
	})

	host := createUserForRoleTest(t, ctx, ts, "host", store.RoleHost)
	admin := createUserForRoleTest(t, ctx, ts, "admin", store.RoleAdmin)
	user := createUserForRoleTest(t, ctx, ts, "user", store.RoleUser)
	service := &APIV1Service{Store: ts}

	t.Run("user cannot promote self", func(t *testing.T) {
		_, err := service.UpdateUser(context.WithValue(ctx, usernameContextKey, user.Username), &v1pb.UpdateUserRequest{
			User: &v1pb.User{
				Name: fmt.Sprintf("users/%d", user.ID),
				Role: v1pb.User_HOST,
			},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"role"}},
		})
		require.Equal(t, codes.PermissionDenied, status.Code(err))
		assertUserRole(t, ctx, ts, user.ID, store.RoleUser)
	})

	t.Run("admin cannot change roles", func(t *testing.T) {
		_, err := service.UpdateUser(context.WithValue(ctx, usernameContextKey, admin.Username), &v1pb.UpdateUserRequest{
			User: &v1pb.User{
				Name: fmt.Sprintf("users/%d", user.ID),
				Role: v1pb.User_ADMIN,
			},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"role"}},
		})
		require.Equal(t, codes.PermissionDenied, status.Code(err))
		assertUserRole(t, ctx, ts, user.ID, store.RoleUser)
	})

	t.Run("host can change roles", func(t *testing.T) {
		updatedUser, err := service.UpdateUser(context.WithValue(ctx, usernameContextKey, host.Username), &v1pb.UpdateUserRequest{
			User: &v1pb.User{
				Name: fmt.Sprintf("users/%d", user.ID),
				Role: v1pb.User_ADMIN,
			},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"role"}},
		})
		require.NoError(t, err)
		require.Equal(t, v1pb.User_ADMIN, updatedUser.Role)
		assertUserRole(t, ctx, ts, user.ID, store.RoleAdmin)
	})
}

func createUserForRoleTest(t *testing.T, ctx context.Context, ts *store.Store, username string, role store.Role) *store.User {
	t.Helper()
	user, err := ts.CreateUser(ctx, &store.User{
		Username:     username,
		Nickname:     username,
		Role:         role,
		PasswordHash: "test-password-hash",
	})
	require.NoError(t, err)
	return user
}

func assertUserRole(t *testing.T, ctx context.Context, ts *store.Store, userID int32, expected store.Role) {
	t.Helper()
	user, err := ts.GetUser(ctx, &store.FindUser{ID: &userID})
	require.NoError(t, err)
	require.NotNil(t, user)
	require.Equal(t, expected, user.Role)
}
