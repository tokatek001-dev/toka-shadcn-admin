# Hiển thị user đang đăng nhập trên layout (sidebar footer + header dropdown)

**Ngày:** 2026-06-06
**Nguồn:** Page feedback trên `/` — "Ô này phải hiện tên user đang đăng nhập"

## Vấn đề

Hai chỗ trên trang `/` hiển thị user seed tĩnh `satnaing` / `satnaingdev@gmail.com`
từ template upstream, dù `useAuthStore` (Supabase) đã giữ user thật sau đăng nhập:

1. **Sidebar footer** — `NavUser` (`src/components/layout/nav-user.tsx`) nhận prop
   `user` từ `sidebarData.user` (`src/components/layout/data/sidebar-data.ts:28-32`).
2. **Header dropdown** — `src/components/profile-dropdown.tsx:26-36` hardcode
   trực tiếp name/email/avatar, kèm `AvatarFallback` tĩnh `SN`.

## Thiết kế (phương án A — hook dùng chung)

### Hook mới: `src/hooks/use-current-user.ts`

```ts
type CurrentUser = {
  name: string      // user_metadata.full_name || phần trước '@' của email || ''
  email: string     // user.email ?? ''
  avatar: string    // user_metadata.avatar_url ?? '' (Google OAuth có sẵn)
  initials: string  // 2 chữ cái đầu của 2 từ đầu trong name, uppercase; 1 từ → 2 ký tự đầu
}

function useCurrentUser(): CurrentUser
```

- Đọc `useAuthStore((s) => s.user)` (Supabase `User`), derive thuần — không thêm state.
- `user === null` (loading/chưa đăng nhập): trả về chuỗi rỗng cho cả 4 field —
  layout đã nằm sau guard `_authenticated` nên trường hợp này chỉ thoáng qua lúc hydrate.
- Logic derive tách thành hàm thuần `deriveCurrentUser(user: User | null): CurrentUser`
  export cùng file để test trực tiếp.

### Thay đổi component

- **`nav-user.tsx`**: bỏ prop `NavUserProps`, gọi `useCurrentUser()` bên trong;
  hai chỗ `AvatarFallback` `SN` → `{initials}`.
- **`app-sidebar.tsx:32`**: `<NavUser user={sidebarData.user} />` → `<NavUser />`.
- **`profile-dropdown.tsx`**: thay avatar/name/email hardcode bằng giá trị từ hook;
  `AvatarFallback` `SN` → `{initials}`.
- **Dọn dữ liệu chết**: xoá `user` khỏi `sidebarData` và khỏi type `SidebarData`
  + type `User` trong `src/components/layout/types.ts` (knip sẽ bắt nếu sót).

### Fallback (đã chốt với user)

- Thiếu `full_name` → dùng phần trước `@` của email (vd `hau.lu@doltech.vn` → `hau.lu`).
- Thiếu avatar → `AvatarImage` src rỗng, `AvatarFallback` hiện initials.

## Kiểm thử

- Test colocated `use-current-user.test.ts` cho `deriveCurrentUser`:
  full_name + avatar (Google), chỉ email/password (fallback name + initials), null user.
- `pnpm lint && pnpm build` phải pass; xác nhận bằng mắt trên dev server.

## Ngoài phạm vi

- Không đụng auth-store, route guard, hay tree `clerk/` legacy.
- Không thay đổi các menu item trong hai dropdown.
