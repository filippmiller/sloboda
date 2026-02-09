// server/config/roles.js
// Role tier definitions and reputation system

const ROLE_TIERS = {
  new_user: {
    level: 0,
    name: 'New User',
    badge_color: '#9CA3AF',
    permissions: {
      can_post: false,
      can_comment: true,
      can_upload_images: false,
      can_create_threads: false,
      can_edit_own_posts: false,
      can_delete_own_posts: false,
      can_upvote: true,
      can_downvote: false,
      can_report: true,
      max_comments_per_day: 10,
      max_comment_length: 500,
    },
    promotion_criteria: {
      days_registered: 7,
      OR: {
        total_points: 10,
        comments_made: 5,
        upvotes_received: 10
      }
    }
  },

  member: {
    level: 1,
    name: 'Member',
    badge_color: '#3B82F6',
    permissions: {
      can_post: true,
      can_comment: true,
      can_upload_images: true,
      can_create_threads: true,
      can_edit_own_posts: true,
      can_delete_own_posts: true,
      can_upvote: true,
      can_downvote: true,
      can_report: true,
      can_bookmark: true,
      max_comments_per_day: 50,
      max_threads_per_day: 5,
      max_comment_length: 2000,
      edit_window_minutes: 5,
    },
    promotion_criteria: {
      days_registered: 30,
      AND: {
        total_points: 100,
        threads_created: 3,
        comments_made: 25,
        upvotes_received: 50
      }
    }
  },

  senior_member: {
    level: 2,
    name: 'Senior Member',
    badge_color: '#8B5CF6',
    permissions: {
      can_post: true,
      can_comment: true,
      can_upload_images: true,
      can_create_threads: true,
      can_edit_own_posts: true,
      can_delete_own_posts: true,
      can_upvote: true,
      can_downvote: true,
      can_report: true,
      can_bookmark: true,
      can_edit_wiki: true,
      can_suggest_categories: true,
      max_comments_per_day: 100,
      max_threads_per_day: 10,
      max_comment_length: 5000,
      edit_window_minutes: 30,
      can_see_vote_counts: true,
      can_see_deleted_indicator: true,
    }
  },

  moderator: {
    level: 3,
    name: 'Moderator',
    badge_color: '#10B981',
    permissions: {
      can_post: true,
      can_comment: true,
      can_upload_images: true,
      can_create_threads: true,
      can_edit_own_posts: true,
      can_delete_own_posts: true,
      can_upvote: true,
      can_downvote: true,
      can_report: true,
      can_bookmark: true,
      can_edit_wiki: true,
      can_suggest_categories: true,
      can_pin_threads: true,
      can_lock_threads: true,
      can_delete_others_content: true,
      can_warn_users: true,
      can_ban_users_temporary: true,
      can_move_threads: true,
      can_edit_thread_tags: true,
      can_merge_threads: true,
      can_view_reports: true,
      can_resolve_reports: true,
      can_view_mod_log: true,
      can_view_user_history: true,
      max_comments_per_day: null,
      max_threads_per_day: null,
      edit_window_minutes: null,
    },
    requires_admin_promotion: true
  },

  super_moderator: {
    level: 4,
    name: 'Super Moderator',
    badge_color: '#F59E0B',
    permissions: {
      can_post: true,
      can_comment: true,
      can_upload_images: true,
      can_create_threads: true,
      can_edit_own_posts: true,
      can_delete_own_posts: true,
      can_upvote: true,
      can_downvote: true,
      can_report: true,
      can_bookmark: true,
      can_edit_wiki: true,
      can_suggest_categories: true,
      can_pin_threads: true,
      can_lock_threads: true,
      can_delete_others_content: true,
      can_warn_users: true,
      can_ban_users_temporary: true,
      can_ban_users_permanent: true,
      can_appoint_moderators: true,
      can_remove_moderators: true,
      can_move_threads: true,
      can_edit_thread_tags: true,
      can_merge_threads: true,
      can_view_reports: true,
      can_resolve_reports: true,
      can_view_mod_log: true,
      can_view_user_history: true,
      can_view_ip_info: true,
      can_access_admin_panel: true,
      can_manage_categories: true,
      max_comments_per_day: null,
      max_threads_per_day: null,
      edit_window_minutes: null,
      moderates_all_categories: true
    },
    requires_admin_promotion: true
  }
};

const REPUTATION_ACTIONS = {
  // Earning points
  create_thread: 2,
  create_comment: 1,
  receive_upvote_comment: 2,
  receive_upvote_thread: 5,
  accepted_answer: 15,
  contribute_to_wiki: 10,
  reported_content_actioned: 5,

  // Losing points
  receive_downvote_comment: -1,
  receive_downvote_thread: -2,
  content_deleted_by_mod: -10,
  receive_warning: -20,
  banned_temporary: -50,
  banned_permanent: -100,

  // Daily limits
  max_upvote_points_per_day: 50,
  max_comment_points_per_day: 20
};

module.exports = {
  ROLE_TIERS,
  REPUTATION_ACTIONS
};
