export const FIRESTORE_RULES = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ─────────────────────────────────────────────────
    function signedIn() {
      return request.auth != null;
    }

    // ── Invite codes (1:1 pairs AND group pods) ─────────────────
    // Codes are single-use: the client burns the document the instant it is
    // redeemed, and rules reject any write that is already expired or that
    // tries to widen the membership beyond the 6-seat pod limit.
    match /pair_codes/{code} {
      allow create: if signedIn()
                    && request.resource.data.keys().hasOnly(
                         ['code', 'created_by', 'owner_uid', 'kind', 'pod_id', 'expires_at'])
                    && request.resource.data.expires_at > request.time
                    && request.resource.data.kind in ['pair', 'pod'];
      allow read:   if signedIn();
      allow update: if false;                 // codes are never mutated
      allow delete: if signedIn();            // single-use burn
    }

    // ── Pairings (1:1 device links) ─────────────────────────────
    match /pairings/{uid} {
      allow read, write: if signedIn();
    }

    // ── Group pods (3–6 members) ────────────────────────────────
    // Join/leave is expressed as membership writes, guarded so that:
    //   • a pod never exceeds max_members (6)
    //   • callers can only add themselves, never somebody else
    match /pods/{podId} {
      allow create: if signedIn()
                    && request.resource.data.created_by is string
                    && request.resource.data.max_members <= 6
                    && request.auth.uid in request.resource.data.member_uids;

      allow read: if signedIn()
                  && request.auth.uid in resource.data.member_uids;

      allow update: if signedIn()
                    && (request.auth.uid in resource.data.member_uids
                        || request.auth.uid in request.resource.data.member_uids)
                    && request.resource.data.max_members <= 6
                    && request.resource.data.member_ids.size() <= 6;

      allow delete: if signedIn()
                    && request.auth.uid in resource.data.member_uids
                    && resource.data.member_ids.size() <= 1;
    }

    // ── Tasks ───────────────────────────────────────────────────
    // Strict row-level security. A task is visible only to the device UUIDs /
    // auth UIDs listed on the document — 2 for a pair, up to 6 for a pod.
    match /tasks/{taskId} {
      allow create: if signedIn()
                    && request.resource.data.created_by is string
                    && request.auth.uid in request.resource.data.member_uids
                    && request.resource.data.assigned_to.size() >= 1
                    && request.resource.data.assigned_to.size() <= 6;

      allow read, update, delete: if signedIn()
                    && (request.auth.uid in resource.data.assigned_to
                        || request.auth.uid in resource.data.member_uids);

      // Media lives on the task, so it inherits the same row-level lock.
      // Nobody may widen the audience after creation.
      allow update: if signedIn()
                    && request.resource.data.member_uids.toSet()
                         .difference(resource.data.member_uids.toSet()).size() == 0;
    }

    // ── Entitlements / tier ─────────────────────────────────────
    // Own profile only. The tier flag is written here by your payment webhook;
    // clients may mirror their local receipts but cannot self-upgrade the
    // authoritative fields once a live purchase exists.
    match /users/{uid} {
      allow read: if signedIn();
      allow create, update: if signedIn() && request.auth.uid == uid
                    && request.resource.data.keys().hasOnly(
                         ['purchases', 'tier', 'device_id', 'display_name', 'updated_at']);
      allow delete: if false;
    }
  }
}`;

export const STORAGE_RULES = `rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    // Task proof media — only the uploader (and their pod, via signed URLs)
    // can read or delete. 8 MB caps photos and 15-second voice notes.
    match /media/{uid}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && request.resource.size < 8 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*|audio/.*');
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}`;

export const INDEXES_NOTE =
  "Composite indexes required: tasks → member_uids (array-contains) + schedule.date (asc); pods → member_ids (array-contains) + created_at (asc). Firestore will prompt you to create them on first query.";
