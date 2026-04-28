const {
  parseLimit,
  buildFeedSortConfig,
  buildFeedCursorWhereClause,
  buildCursorResponse
} = require('../backend/services/paginationService');

describe('Pagination Service', () => {
  test('parseLimit respects defaults and max bound', () => {
    expect(parseLimit(undefined)).toBe(20);
    expect(parseLimit('15')).toBe(15);
    expect(parseLimit('200')).toBe(100);
    expect(parseLimit('0')).toBe(20);
  });

  test('buildFeedSortConfig returns expected newest sort config', () => {
    const config = buildFeedSortConfig('newest');
    expect(config.orderBy).toBe('created_at DESC, id DESC');
    expect(config.cursorOperator).toBe('<');
  });

  test('buildFeedSortConfig returns expected oldest sort config', () => {
    const config = buildFeedSortConfig('oldest');
    expect(config.orderBy).toBe('created_at ASC, id ASC');
    expect(config.cursorOperator).toBe('>');
  });

  test('buildFeedSortConfig returns expected comment sort config', () => {
    const config = buildFeedSortConfig('new-comments');
    expect(config.orderBy).toContain('COALESCE(last_commented_at, created_at) DESC, id DESC');
    expect(config.usesCommentSortAt).toBe(true);
  });

  test('buildFeedCursorWhereClause returns a stable cursor predicate', () => {
    const result = buildFeedCursorWhereClause({ sort: 'newest', cursor: '2026-04-28T00:00:00.000Z' });
    expect(result.whereClause).toContain('created_at < ?');
    expect(result.whereClause).toContain('id < ?');
    expect(result.params).toHaveLength(3);
  });

  test('buildCursorResponse slices items and returns cursor', () => {
    const items = [
      { id: 1, created_at: '2026-01-01T00:00:00.000Z' },
      { id: 2, created_at: '2026-01-02T00:00:00.000Z' },
      { id: 3, created_at: '2026-01-03T00:00:00.000Z' }
    ];

    const result = buildCursorResponse(items, 2);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe('2026-01-02T00:00:00.000Z');
  });
});
