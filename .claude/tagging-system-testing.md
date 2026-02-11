# Tagging System Enhancement - Testing Guide

## Quick Start Testing

### Prerequisites
1. Ensure database migrations have run:
   - `tag_categories` table exists
   - `post_tag_metadata` table exists
   - Tag categories are seeded (Skills, Topics, Location, Stage)

2. Server is running on port 3013 (or configured port)
3. Client is built or running in dev mode

## API Endpoint Testing

### Test Tag Popularity
```bash
# Get top 20 popular tags
curl http://localhost:3013/api/tags/popular?limit=20

# Expected response:
# [
#   { "tag": "permaculture", "count": 12 },
#   { "tag": "construction", "count": 8 },
#   ...
# ]
```

### Test Tag Search
```bash
# Search for tags containing "perm"
curl http://localhost:3013/api/tags/search?q=perm

# Expected response:
# [
#   { "tag": "permaculture", "count": 12 },
#   { "tag": "permanent", "count": 3 }
# ]
```

### Test Related Tags
```bash
# Get tags related to "permaculture"
curl http://localhost:3013/api/tags/related?tag=permaculture

# Expected response:
# [
#   { "tag": "water", "count": 8 },
#   { "tag": "food", "count": 6 },
#   { "tag": "community", "count": 4 }
# ]
```

### Test Tag Categories
```bash
# Get all tag categories
curl http://localhost:3013/api/tags/categories

# Expected response:
# [
#   { "id": 1, "name": "Skills", "slug": "skills", "color": "#3498db", "description": "..." },
#   ...
# ]
```

## UI Testing

### Admin Post Editor

1. **Navigate:** Login as admin → Admin Panel → Posts → Create New
2. **Test Autocomplete:**
   - Focus on the "Tags" field
   - Type "per" - should show suggestions like "permaculture" with count
   - Click a suggestion - tag should be added as a chip
   - Type a new tag "newTag" and press Enter - should add as new tag
3. **Test Tag Removal:**
   - Click X on a tag chip - should remove it
   - Press Backspace with empty input - should remove last tag
4. **Test Tag Persistence:**
   - Add tags: ["permaculture", "water", "food"]
   - Save post (draft or published)
   - Reload page and edit post
   - Tags should still be there as chips

### Library (User Side)

1. **Navigate:** User Portal → Library
2. **Test Tag Cloud Toggle:**
   - Click "Show tag cloud" button
   - Tag cloud should appear with size-weighted tags
   - Larger tags = more popular
   - Click "Hide tag cloud" - should collapse
3. **Test Tag Selection:**
   - Show tag cloud
   - Click on "permaculture" tag
   - Should add to "Filtering by:" section
   - Content should filter to only posts with that tag
4. **Test Multi-Tag Filtering (AND logic):**
   - Select "permaculture"
   - Click on "water" tag
   - Both tags should be in "Filtering by:" section
   - Content should show only posts with BOTH tags
5. **Test Related Tags:**
   - With "permaculture" selected
   - "Related:" section should appear
   - Show tags like "water (8)", "food (6)"
   - Click "+" on "water" - should add to filter
6. **Test Tag Removal:**
   - Click X on a selected tag - should remove from filter
   - Click "Clear all tags" - should remove all
7. **Test Legacy Tags:**
   - Hide tag cloud
   - Old tag filter buttons should still work
   - Single tag selection (backward compatible)

## Database Verification

### Check Tag Statistics
```sql
-- Count posts by tag
SELECT
    UNNEST(tags) as tag,
    COUNT(*) as post_count
FROM posts
WHERE tags IS NOT NULL AND status = 'published'
GROUP BY tag
ORDER BY post_count DESC
LIMIT 20;
```

### Check Tag Categories
```sql
-- View all tag categories
SELECT * FROM tag_categories ORDER BY sort_order;
```

### Check Tag Metadata
```sql
-- View tag-category mappings (if any assigned)
SELECT p.title, ptm.tag, tc.name as category
FROM post_tag_metadata ptm
JOIN posts p ON p.id = ptm.post_id
LEFT JOIN tag_categories tc ON tc.id = ptm.category_id
LIMIT 20;
```

## Common Issues & Troubleshooting

### Issue: "Tags not showing in autocomplete"
**Solution:**
- Check API endpoint: `curl http://localhost:3013/api/tags/popular`
- Verify posts have tags in database
- Check browser console for CORS errors
- Ensure `/api/tags` route is registered in `server/index.js`

### Issue: "Tag cloud not appearing"
**Solution:**
- Check that posts have tags (need at least some tagged posts)
- Verify API returns data: `curl http://localhost:3013/api/tags/popular`
- Check browser console for errors
- Try refreshing page

### Issue: "Related tags not showing"
**Solution:**
- Ensure posts have multiple tags (need co-occurrence)
- Check API: `curl http://localhost:3013/api/tags/related?tag=yourTag`
- Verify at least 2+ posts share tags

### Issue: "Database queries slow"
**Solution:**
- Add GIN index on tags column:
  ```sql
  CREATE INDEX idx_posts_tags_gin ON posts USING GIN (tags);
  ```

### Issue: "Tags not persisting in admin editor"
**Solution:**
- Check form state is `string[]` not `string`
- Verify payload sent to backend is array
- Check browser Network tab for request body

## Performance Testing

### Tag Cloud Load Time
- With 1000+ posts: Tag cloud should load in < 500ms
- Tag search should debounce and respond in < 300ms after typing stops

### Multi-Tag Filter
- Filtering by 3+ tags should be instant (client-side)
- No additional API calls when adding/removing tags

### Related Tags
- Should load within 200ms after tag selection
- Uses separate API call, doesn't block UI

## Test Data Setup

### Create Sample Posts with Tags
```sql
-- Insert test posts with various tags
INSERT INTO posts (title, body, type, status, tags) VALUES
('Permaculture Design', 'Content here', 'article', 'published', ARRAY['permaculture', 'design', 'planning']),
('Water Management', 'Content here', 'article', 'published', ARRAY['water', 'permaculture', 'infrastructure']),
('Community Building', 'Content here', 'article', 'published', ARRAY['community', 'governance', 'planning']),
('Construction Basics', 'Content here', 'article', 'published', ARRAY['construction', 'building', 'skills']),
('Food Forest Guide', 'Content here', 'article', 'published', ARRAY['food', 'permaculture', 'agriculture']);
```

### Verify Test Data
```sql
-- Check tags are properly stored
SELECT id, title, tags FROM posts WHERE tags IS NOT NULL LIMIT 10;
```

## Acceptance Criteria Checklist

### Enhancement 1: Tag Autocomplete ✅
- [x] Admin editor uses autocomplete component
- [x] Shows existing tags with frequency counts
- [x] Allows creating new tags
- [x] Debounced search
- [x] Keyboard navigation (Enter, Backspace)

### Enhancement 2: Tag Hierarchy & Categories ✅
- [x] Created `tag_categories` table
- [x] Seeded 4 categories (Skills, Topics, Location, Stage)
- [x] Categories have colors
- [x] API endpoint for categories

### Enhancement 3: Tag Popularity & Search ✅
- [x] Tag cloud visualization
- [x] Tag size proportional to frequency
- [x] Click to filter
- [x] Tag count displayed
- [x] Search tags API

### Enhancement 4: Related Tags Suggestions ✅
- [x] Shows co-occurring tags
- [x] Click to add to filter
- [x] Counts displayed
- [x] Filtered by already selected tags

## Next Steps After Testing

1. Monitor API performance with production data
2. Consider adding GIN index if tag queries are slow
3. Gather user feedback on tag cloud UX
4. Consider implementing tag categorization UI
5. Add analytics for tag usage patterns
