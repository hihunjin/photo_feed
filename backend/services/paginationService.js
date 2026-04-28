function parseLimit(limit, defaultLimit = 20, maxLimit = 100) {
  const parsed = parseInt(limit, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultLimit;
  }
  return Math.min(parsed, maxLimit);
}

function buildFeedSortConfig(sort = 'newest') {
  if (sort === 'oldest') {
    return {
      orderBy: 'created_at ASC, id ASC',
      cursorOperator: '>',
      usesCommentSortAt: false
    };
  }

  if (sort === 'new-comments') {
    return {
      orderBy: 'COALESCE(last_commented_at, created_at) DESC, id DESC',
      cursorOperator: '<',
      usesCommentSortAt: true
    };
  }

  return {
    orderBy: 'created_at DESC, id DESC',
    cursorOperator: '<',
    usesCommentSortAt: false
  };
}

function buildFeedCursorWhereClause({ sort = 'newest', cursor = null }) {
  const config = buildFeedSortConfig(sort);
  if (!cursor) {
    return {
      whereClause: '',
      params: [],
      orderBy: config.orderBy,
      usesCommentSortAt: config.usesCommentSortAt
    };
  }

  const cursorField = config.usesCommentSortAt ? 'COALESCE(last_commented_at, created_at)' : 'created_at';
  return {
    whereClause: ` AND (${cursorField} ${config.cursorOperator} ? OR (${cursorField} = ? AND id ${config.cursorOperator} ?))`,
    params: [cursor, cursor, cursor.id || cursor.cursorId || 0],
    orderBy: config.orderBy,
    usesCommentSortAt: config.usesCommentSortAt
  };
}

function buildCursorResponse(items, limit, cursorKey = 'created_at') {
  const hasMore = items.length > limit;
  const sliced = hasMore ? items.slice(0, limit) : items;
  const lastItem = sliced[sliced.length - 1];

  return {
    items: sliced,
    hasMore,
    cursor: hasMore && lastItem ? lastItem[cursorKey] : null
  };
}

module.exports = {
  parseLimit,
  buildFeedSortConfig,
  buildFeedCursorWhereClause,
  buildCursorResponse
};
