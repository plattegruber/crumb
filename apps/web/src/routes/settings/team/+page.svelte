<script lang="ts">
  import { onMount } from "svelte";
  import { settings, type TeamMember, ApiError } from "$lib/api.js";

  let members = $state<TeamMember[]>([]);
  let subscriptionTier = $state("Free");
  let loading = $state(true);
  let inviting = $state(false);
  let removingId = $state<string | null>(null);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);

  // Invite form
  let inviteEmail = $state("");
  let inviteRole = $state("Member");

  const isStudio = $derived(subscriptionTier === "Studio");
  const acceptedMembers = $derived(members.filter((m) => m.accepted_at !== null));
  const pendingMembers = $derived(members.filter((m) => m.accepted_at === null));

  async function fetchTeam() {
    loading = true;
    error = null;
    try {
      const res = await settings.getTeam();
      members = res.members;
      subscriptionTier = res.subscription_tier;
    } catch (e) {
      console.error("Failed to load team:", e);
      error = "Failed to load team information.";
    } finally {
      loading = false;
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      error = "Email address is required.";
      return;
    }

    inviting = true;
    error = null;
    successMessage = null;

    try {
      const res = await settings.inviteTeamMember(inviteEmail.trim(), inviteRole);
      members = [...members, res.member];
      inviteEmail = "";
      inviteRole = "Member";
      successMessage = `Invitation sent to ${res.member.email}`;
    } catch (e) {
      console.error("Failed to invite member:", e);
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown>;
        error = (body?.error as string) ?? "Failed to send invitation.";
      } else {
        error = "Failed to send invitation.";
      }
    } finally {
      inviting = false;
    }
  }

  async function handleRemove(member: TeamMember) {
    if (!confirm(`Remove ${member.email} from the team?`)) {
      return;
    }

    removingId = member.id;
    error = null;
    successMessage = null;

    try {
      await settings.removeTeamMember(member.id);
      members = members.filter((m) => m.id !== member.id);
      successMessage = `${member.email} has been removed from the team.`;
    } catch (e) {
      console.error("Failed to remove member:", e);
      error = "Failed to remove team member.";
    } finally {
      removingId = null;
    }
  }

  onMount(() => {
    void fetchTeam();
  });
</script>

<svelte:head>
  <title>Team - dough</title>
</svelte:head>

<div class="settings-subpage">
  <a href="/settings" class="back-link">&larr; Back to Settings</a>
  <h1>Team Management</h1>
  <p class="page-description">
    Invite team members and manage roles. Available on the Studio tier.
  </p>

  {#if successMessage}
    <div class="success-banner">
      <p>{successMessage}</p>
      <button class="btn-ghost dismiss-btn" onclick={() => (successMessage = null)}>
        Dismiss
      </button>
    </div>
  {/if}

  {#if error}
    <div class="error-banner">
      <p>{error}</p>
      <button class="btn-ghost dismiss-btn" onclick={() => (error = null)}>Dismiss</button>
    </div>
  {/if}

  {#if loading}
    <div class="loading">
      <p>Loading team...</p>
    </div>
  {:else if !isStudio}
    <div class="card upgrade-card">
      <div class="upgrade-content">
        <h3>Upgrade to Studio</h3>
        <p>
          Team management is available on the Studio subscription tier. Upgrade to collaborate with
          others on your recipe library and products.
        </p>
        <p class="current-tier">
          Your current tier: <strong>{subscriptionTier}</strong>
        </p>
      </div>
    </div>
  {:else}
    <!-- Invite Form -->
    <div class="card form-section">
      <h3>Invite Team Member</h3>
      <form
        class="invite-form"
        onsubmit={(e) => {
          e.preventDefault();
          handleInvite();
        }}
      >
        <div class="invite-fields">
          <div class="form-group email-group">
            <label for="invite-email">Email Address</label>
            <input
              type="email"
              id="invite-email"
              bind:value={inviteEmail}
              placeholder="colleague@example.com"
              required
            />
          </div>
          <div class="form-group role-group">
            <label for="invite-role">Role</label>
            <select id="invite-role" bind:value={inviteRole}>
              <option value="Member">Member</option>
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary" disabled={inviting || !inviteEmail.trim()}>
          {inviting ? "Sending..." : "Send Invite"}
        </button>
      </form>
    </div>

    <!-- Active Members -->
    {#if acceptedMembers.length > 0}
      <div class="card members-section">
        <h3>Team Members</h3>
        <div class="members-list">
          {#each acceptedMembers as member (member.id)}
            <div class="member-row">
              <div class="member-info">
                <span class="member-email">{member.email}</span>
                <span class="member-role">{member.role}</span>
              </div>
              <div class="member-meta">
                <span class="member-joined">
                  Joined {new Date(member.accepted_at ?? member.invited_at).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                </span>
                <button
                  class="btn btn-danger btn-sm"
                  onclick={() => handleRemove(member)}
                  disabled={removingId === member.id}
                >
                  {removingId === member.id ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Pending Invites -->
    {#if pendingMembers.length > 0}
      <div class="card members-section">
        <h3>Pending Invites</h3>
        <div class="members-list">
          {#each pendingMembers as member (member.id)}
            <div class="member-row pending">
              <div class="member-info">
                <span class="member-email">{member.email}</span>
                <span class="member-status">Pending</span>
              </div>
              <div class="member-meta">
                <span class="member-invited">
                  Invited {new Date(member.invited_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <button
                  class="btn btn-danger btn-sm"
                  onclick={() => handleRemove(member)}
                  disabled={removingId === member.id}
                >
                  {removingId === member.id ? "Removing..." : "Revoke"}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Empty state -->
    {#if members.length === 0}
      <div class="card empty-state">
        <p>No team members yet. Use the form above to invite your first collaborator.</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .settings-subpage {
    max-width: 640px;
  }

  .back-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    display: inline-block;
    margin-bottom: var(--space-4);
  }

  .settings-subpage h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-2);
  }

  .page-description {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-6);
  }

  .success-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-success-light);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    color: var(--color-success);
    font-size: var(--font-size-sm);
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-danger-light);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    color: var(--color-danger);
    font-size: var(--font-size-sm);
  }

  .dismiss-btn {
    flex-shrink: 0;
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
  }

  .form-section {
    margin-bottom: var(--space-4);
  }

  .form-section h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-4);
  }

  .invite-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .invite-fields {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-3);
  }

  .form-group {
    display: flex;
    flex-direction: column;
  }

  .form-group label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    margin-bottom: var(--space-1);
  }

  .role-group select {
    min-width: 120px;
  }

  .members-section {
    margin-bottom: var(--space-4);
  }

  .members-section h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-4);
  }

  .members-list {
    display: flex;
    flex-direction: column;
  }

  .member-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--color-border-light);
  }

  .member-row:last-child {
    border-bottom: none;
  }

  .member-row.pending {
    opacity: 0.7;
  }

  .member-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .member-email {
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  .member-role {
    font-size: var(--font-size-xs);
    background: var(--color-bg-tertiary);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
  }

  .member-status {
    font-size: var(--font-size-xs);
    background: var(--color-warning-light);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    color: var(--color-warning);
  }

  .member-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .member-joined,
  .member-invited {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .btn-sm {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
  }

  .upgrade-card {
    text-align: center;
    padding: var(--space-8);
  }

  .upgrade-content h3 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-3);
  }

  .upgrade-content p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-3);
  }

  .current-tier {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  .empty-state {
    text-align: center;
    padding: var(--space-8);
  }

  .empty-state p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .loading {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  @media (max-width: 768px) {
    .invite-fields {
      grid-template-columns: 1fr;
    }

    .member-row {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .member-meta {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
