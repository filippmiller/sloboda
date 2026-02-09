-- ============================================
-- SLOBODA FORUM SYSTEM - DATABASE MIGRATIONS
-- CORRECTED: All tables use forum_ prefix
-- ============================================

-- Drop old incorrectly-named tables (from previous migration)
DROP TABLE IF EXISTS comment_votes CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS moderator_categories CASCADE;
DROP TABLE IF EXISTS user_warnings CASCADE;
DROP TABLE IF EXISTS user_bans CASCADE;
DROP TABLE IF EXISTS moderation_actions CASCADE;
DROP TABLE IF EXISTS user_reputation CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS threads CASCADE;

-- Drop old triggers and functions
DROP TRIGGER IF EXISTS trigger_update_thread_activity ON comments;
DROP TRIGGER IF EXISTS trigger_update_comment_votes ON comment_votes;
DROP FUNCTION IF EXISTS update_thread_activity();
DROP FUNCTION IF EXISTS update_comment_votes();

-- ============================================
-- ALTER USERS TABLE - Add forum role reference
-- ============================================
-- Add forum_role_id column to users table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'forum_role_id'
    ) THEN
        ALTER TABLE users ADD COLUMN forum_role_id INTEGER;
    END IF;
END$$;

-- ============================================
-- FORUM THREADS (standalone discussions)
-- ============================================
CREATE TABLE IF NOT EXISTS forum_threads (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    type VARCHAR(50) DEFAULT 'discussion', -- discussion, question, announcement
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,

    -- Engagement metrics
    view_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,

    -- Moderation
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_by INTEGER REFERENCES admins(id),
    deleted_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_threads_category ON forum_threads(category_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_author ON forum_threads(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_last_activity ON forum_threads(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_threads_category_activity ON forum_threads(category_id, last_activity_at DESC);

-- ============================================
-- FORUM COMMENTS (for threads only)
-- ============================================
CREATE TABLE IF NOT EXISTS forum_comments (
    id SERIAL PRIMARY KEY,
    body TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Belongs to thread
    thread_id INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,

    -- Nested threading
    parent_comment_id INTEGER REFERENCES forum_comments(id) ON DELETE CASCADE,
    depth INTEGER DEFAULT 0, -- 0 = top-level, increments with nesting

    -- Engagement
    upvote_count INTEGER DEFAULT 0,
    downvote_count INTEGER DEFAULT 0,

    -- Moderation
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_by INTEGER REFERENCES admins(id),
    deleted_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_comments_thread ON forum_comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_parent ON forum_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_author ON forum_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_thread_parent ON forum_comments(thread_id, parent_comment_id);

-- ============================================
-- FORUM VOTES (for comments)
-- ============================================
CREATE TABLE IF NOT EXISTS forum_votes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INTEGER NOT NULL REFERENCES forum_comments(id) ON DELETE CASCADE,
    vote_value INTEGER NOT NULL CHECK (vote_value IN (-1, 1)), -- -1 downvote, 1 upvote
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_forum_votes_comment ON forum_votes(comment_id);

-- ============================================
-- FORUM ROLES (tiered permission system)
-- ============================================
CREATE TABLE IF NOT EXISTS forum_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Tier system: new_user → member → senior_member → moderator → super_moderator
    role VARCHAR(50) DEFAULT 'new_user' NOT NULL,

    -- Permissions unlocked at each tier
    can_post BOOLEAN DEFAULT TRUE,
    can_comment BOOLEAN DEFAULT TRUE,
    can_upload_images BOOLEAN DEFAULT FALSE,
    can_create_threads BOOLEAN DEFAULT FALSE,
    can_edit_own_posts BOOLEAN DEFAULT FALSE,
    can_delete_own_posts BOOLEAN DEFAULT FALSE,

    -- Moderator powers (only for moderator+)
    can_pin_threads BOOLEAN DEFAULT FALSE,
    can_lock_threads BOOLEAN DEFAULT FALSE,
    can_delete_others_content BOOLEAN DEFAULT FALSE,
    can_ban_users BOOLEAN DEFAULT FALSE,
    can_warn_users BOOLEAN DEFAULT FALSE,
    can_ban_users_temporary BOOLEAN DEFAULT FALSE,
    can_ban_users_permanent BOOLEAN DEFAULT FALSE,
    can_appoint_moderators BOOLEAN DEFAULT FALSE,
    can_remove_moderators BOOLEAN DEFAULT FALSE,
    can_view_mod_log BOOLEAN DEFAULT FALSE,
    can_view_user_history BOOLEAN DEFAULT FALSE,
    can_view_ip_info BOOLEAN DEFAULT FALSE,
    can_access_admin_panel BOOLEAN DEFAULT FALSE,
    can_manage_categories BOOLEAN DEFAULT FALSE,
    can_move_threads BOOLEAN DEFAULT FALSE,
    can_edit_thread_tags BOOLEAN DEFAULT FALSE,
    can_merge_threads BOOLEAN DEFAULT FALSE,
    can_view_reports BOOLEAN DEFAULT FALSE,
    can_resolve_reports BOOLEAN DEFAULT FALSE,
    can_edit_wiki BOOLEAN DEFAULT FALSE,
    can_suggest_categories BOOLEAN DEFAULT FALSE,
    can_bookmark BOOLEAN DEFAULT FALSE,
    can_report BOOLEAN DEFAULT TRUE,
    can_upvote BOOLEAN DEFAULT TRUE,
    can_downvote BOOLEAN DEFAULT FALSE,
    can_see_vote_counts BOOLEAN DEFAULT FALSE,
    can_see_deleted_indicator BOOLEAN DEFAULT FALSE,
    moderates_all_categories BOOLEAN DEFAULT FALSE,

    -- Tracking
    promoted_at TIMESTAMP,
    promoted_by INTEGER REFERENCES admins(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_roles_user ON forum_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_roles_role ON forum_roles(role);

-- ============================================
-- FORUM REPUTATION (for automatic tier advancement)
-- ============================================
CREATE TABLE IF NOT EXISTS forum_reputation (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Reputation points
    total_points INTEGER DEFAULT 0,

    -- Activity metrics
    posts_created INTEGER DEFAULT 0,
    threads_created INTEGER DEFAULT 0,
    comments_made INTEGER DEFAULT 0,
    upvotes_received INTEGER DEFAULT 0,
    downvotes_received INTEGER DEFAULT 0,

    -- Milestones for auto-promotion
    days_since_registration INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_reputation_user ON forum_reputation(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_reputation_points ON forum_reputation(total_points DESC);

-- ============================================
-- FORUM MODERATION ACTIONS (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS forum_moderation_actions (
    id SERIAL PRIMARY KEY,
    moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL, -- delete_comment, delete_thread, ban_user, warn_user, lock_thread, pin_thread

    -- Target of action
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    target_comment_id INTEGER REFERENCES forum_comments(id) ON DELETE SET NULL,
    target_thread_id INTEGER REFERENCES forum_threads(id) ON DELETE SET NULL,

    reason TEXT,
    details JSONB, -- Store additional context

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_moderation_actions_moderator ON forum_moderation_actions(moderator_id);
CREATE INDEX IF NOT EXISTS idx_forum_moderation_actions_target_user ON forum_moderation_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_forum_moderation_actions_type ON forum_moderation_actions(action_type);

-- ============================================
-- FORUM USER BANS
-- ============================================
CREATE TABLE IF NOT EXISTS forum_bans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

    ban_type VARCHAR(50) NOT NULL, -- temporary, permanent
    reason TEXT NOT NULL,

    banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP, -- NULL for permanent bans

    is_active BOOLEAN DEFAULT TRUE,
    lifted_at TIMESTAMP,
    lifted_by INTEGER REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_forum_bans_user ON forum_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_bans_active ON forum_bans(is_active);

-- ============================================
-- FORUM USER WARNINGS
-- ============================================
CREATE TABLE IF NOT EXISTS forum_warnings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

    severity VARCHAR(50) DEFAULT 'low', -- low, medium, high
    reason TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_warnings_user ON forum_warnings(user_id);

-- ============================================
-- FORUM MODERATOR CATEGORIES (category-specific mods)
-- ============================================
CREATE TABLE IF NOT EXISTS forum_moderator_categories (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, category_id)
);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update thread's last_activity_at when new comment added
CREATE OR REPLACE FUNCTION update_forum_thread_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE forum_threads
    SET last_activity_at = NEW.created_at,
        comment_count = comment_count + 1
    WHERE id = NEW.thread_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_forum_thread_activity ON forum_comments;
CREATE TRIGGER trigger_update_forum_thread_activity
AFTER INSERT ON forum_comments
FOR EACH ROW
EXECUTE FUNCTION update_forum_thread_activity();

-- Update comment vote counts when vote added/changed
CREATE OR REPLACE FUNCTION update_forum_comment_votes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.vote_value = 1 THEN
            UPDATE forum_comments SET upvote_count = upvote_count + 1 WHERE id = NEW.comment_id;
        ELSE
            UPDATE forum_comments SET downvote_count = downvote_count + 1 WHERE id = NEW.comment_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.vote_value = 1 AND NEW.vote_value = -1 THEN
            UPDATE forum_comments SET upvote_count = upvote_count - 1, downvote_count = downvote_count + 1 WHERE id = NEW.comment_id;
        ELSIF OLD.vote_value = -1 AND NEW.vote_value = 1 THEN
            UPDATE forum_comments SET downvote_count = downvote_count - 1, upvote_count = upvote_count + 1 WHERE id = NEW.comment_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.vote_value = 1 THEN
            UPDATE forum_comments SET upvote_count = upvote_count - 1 WHERE id = OLD.comment_id;
        ELSE
            UPDATE forum_comments SET downvote_count = downvote_count - 1 WHERE id = OLD.comment_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_forum_comment_votes ON forum_votes;
CREATE TRIGGER trigger_update_forum_comment_votes
AFTER INSERT OR UPDATE OR DELETE ON forum_votes
FOR EACH ROW
EXECUTE FUNCTION update_forum_comment_votes();

-- ============================================
-- COMPLETED
-- ============================================
