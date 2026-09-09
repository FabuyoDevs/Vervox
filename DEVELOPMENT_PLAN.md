# App Refactoring & Native Experience Plan

## Priority 1: Standalone PWA & Native Configuration
- [x] Configure `manifest.json` for full standalone execution (`display: "standalone"`, orientation, themes).
- [x] Implement standalone check utilities (`window.matchMedia('(display-mode: standalone)')`) to hide web UI artifacts.
- [x] Prevent web gesture conflicts (e.g., disable pull-to-refresh default browser behavior, rubber-banding).

## Priority 2: Native Permission Architecture
- [x] Create custom native-styled pre-permission dialog modals for Notifications and Device Media.
- [x] Wrap standard web APIs (`Notification.requestPermission()`) inside custom, app-native UI hooks.

## Priority 3: Component & Menu Animations
- [x] Refactor Hamburger/Drawer Menu with spring/physics-based open and close transitions.
- [x] Implement animated Notification/Toast system with entrance, auto-dismiss, and swipe-to-remove physics.

## Priority 4: Task List Micro-Interactions
- [x] Add layout shift animations for task creation (smooth expand into view).
- [x] Add completion/deletion animations (item slides out, list items smoothly rearrange).

## Priority 5: Screen Transitions & Polish
- [x] Implement global view/route transition wrappers.
- [x] Validate touch response latency and ensure 60fps performance across low-end mobile dev
