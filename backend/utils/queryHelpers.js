/**
 * Builds { page, limit, skip } from req.query, with sane defaults/caps.
 */
const paginationFromQuery = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Builds a Mongo sort object from a "field:asc|desc" style query param.
 * Defaults to newest first by createdAt.
 */
const sortFromQuery = (query, defaultField = 'createdAt') => {
  if (!query.sort) return { [defaultField]: -1 };
  const [field, dir] = String(query.sort).split(':');
  return { [field || defaultField]: dir === 'asc' ? 1 : -1 };
};

/**
 * Builds a case-insensitive regex $or search filter across the given fields.
 */
const searchFilter = (query, fields = []) => {
  if (!query.search || fields.length === 0) return {};
  const regex = new RegExp(String(query.search).trim(), 'i');
  return { $or: fields.map((f) => ({ [f]: regex })) };
};

/**
 * Sends a standard paginated list response.
 */
const paginatedResponse = (res, { data, total, page, limit }) => {
  res.status(200).json({
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    }
  });
};

module.exports = { paginationFromQuery, sortFromQuery, searchFilter, paginatedResponse };
