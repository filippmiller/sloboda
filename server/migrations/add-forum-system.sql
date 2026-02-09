-- ============================================
-- SLOBODA FORUM SYSTEM - DATABASE MIGRATIONS
-- ============================================

-- ============================================
-- FORUM THREADS (standalone discussions)
-- ============================================
CREATE TABLE IF NOT EXISTS threads (
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

CREATE INDEX IF NOT EXISTS idx_threads_category ON threads(category_id);
CREATE INDEX IF NOT EXISTS idx_threads_author ON threads(author_id);
CREATE INDEX IF NOT EXISTS idx_threads_last_activity ON threads(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_category_activity ON threads(category_id, last_activity_at DESC);

-- ============================================
-- COMMENTS (works for both posts and threads)
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    body TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Polymorphic: can belong to post OR thread
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,

    -- Nested threading
    parent_comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    depth INTEGER DEFAULT 0, -- 0 = top-level, increments with nesting

    -- Engagement
    upvote_count INTEGER DEFAULT 0,
    downvote_count INTEGER DEFAULT 0,

    -- Moderation
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_by INTEGER REFERENCES admins(id),
    deleted_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraint: must belong to either post OR thread, not both
    CONSTRAINT check_comment_parent CHECK (
        (post_id IS NOT NULL AND thread_id IS NULL) OR
        (post_id IS NULL AND thread_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_thread_parent ON comments(thread_id, parent_comment_id);

-- ============================================
-- COMMENT VOTES
-- ============================================
CREATE TABLE IF NOT EXISTS comment_votes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    vote_value INTEGER NOT NULL CHECK (vote_value IN (-1, 1)), -- -1 downvote, 1 upvote
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_votes_comment ON comment_votes(comment_id);

-- ============================================
-- USER ROLES (tiered permission system)
-- ============================================
CREATE TABLE IF NOT EXISTS user_roles (
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

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- ============================================
-- USER REPUTATION (for automatic tier advancement)
-- ============================================
CREATE TABLE IF NOT EXISTS user_reputation (
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

CREATE INDEX IF NOT EXISTS idx_user_reputation_user ON user_reputation(user_id);
CREATE INDEX IF NOT EXISTS idx_user_reputation_points ON user_reputation(total_points DESC);

-- ============================================
-- MODERATION ACTIONS (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS moderation_actions (
    id SERIAL PRIMARY KEY,
    moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL, -- delete_comment, delete_thread, ban_user, warn_user, lock_thread, pin_thread

    -- Target of action
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    target_comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
    target_thread_id INTEGER REFERENCES threads(id) ON DELETE SET NULL,
    target_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,

    reason TEXT,
    details JSONB, -- Store additional context

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_moderator ON moderation_actions(moderator_id);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_target_user ON moderation_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_type ON moderation_actions(action_type);

-- ============================================
-- USER BANS
-- ============================================
CREATE TABLE IF NOT EXISTS user_bans (
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

CREATE INDEX IF NOT EXISTS idx_user_bans_user ON user_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bans_active ON user_bans(is_active);

-- ============================================
-- USER WARNINGS
-- ============================================
CREATE TABLE IF NOT EXISTS user_warnings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

    severity VARCHAR(50) DEFAULT 'low', -- low, medium, high
    reason TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_warnings_user ON user_warnings(user_id);

-- ============================================
-- MODERATOR CATEGORIES (category-specific mods)
-- ============================================
CREATE TABLE IF NOT EXISTS moderator_categories (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, category_id)
);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update thread's last_activity_at when new comment added
CREATE OR REPLACE FUNCTION update_thread_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE threads
    SET last_activity_at = NEW.created_at,
        comment_count = comment_count + 1
    WHERE id = NEW.thread_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_thread_activity ON comments;
CREATE TRIGGER trigger_update_thread_activity
AFTER INSERT ON comments
FOR EACH ROW
WHEN (NEW.thread_id IS NOT NULL)
EXECUTE FUNCTION update_thread_activity();

-- Update comment vote counts when vote added/changed
CREATE OR REPLACE FUNCTION update_comment_votes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.vote_value = 1 THEN
            UPDATE comments SET upvote_count = upvote_count + 1 WHERE id = NEW.comment_id;
        ELSE
            UPDATE comments SET downvote_count = downvote_count + 1 WHERE id = NEW.comment_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.vote_value = 1 AND NEW.vote_value = -1 THEN
            UPDATE comments SET upvote_count = upvote_count - 1, downvote_count = downvote_count + 1 WHERE id = NEW.comment_id;
        ELSIF OLD.vote_value = -1 AND NEW.vote_value = 1 THEN
            UPDATE comments SET downvote_count = downvote_count - 1, upvote_count = upvote_count + 1 WHERE id = NEW.comment_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.vote_value = 1 THEN
            UPDATE comments SET upvote_count = upvote_count - 1 WHERE id = OLD.comment_id;
        ELSE
            UPDATE comments SET downvote_count = downvote_count - 1 WHERE id = OLD.comment_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_comment_votes ON comment_votes;
CREATE TRIGGER trigger_update_comment_votes
AFTER INSERT OR UPDATE OR DELETE ON comment_votes
FOR EACH ROW
EXECUTE FUNCTION update_comment_votes();

-- ============================================
-- COMPLETED
-- ============================================
