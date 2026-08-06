const User = require('../models/User');
const { paginationFromQuery, sortFromQuery, searchFilter, paginatedResponse } = require('../utils/queryHelpers');

// @desc    Get my own profile
// @route   GET /api/users/me
// @access  Private/User
const getMyProfile = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.status(200).json(user.toJSON());
};

// @desc    Update my own profile (name, phone, city)
// @route   PUT /api/users/me
// @access  Private/User
const updateMyProfile = async (req, res) => {
  const { name, phone, city } = req.body;
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (city !== undefined) user.city = city; // replaces localStorage 'userCity'
  user.updatedAt = new Date();
  await user.save();

  res.status(200).json(user.toJSON());
};

// @desc    List users with pagination/search/filter/sort
// @route   GET /api/users?page=&limit=&search=&sort=&isBlocked=
// @access  Private/Admin
const listUsers = async (req, res) => {
  const { page, limit, skip } = paginationFromQuery(req.query);
  const sort = sortFromQuery(req.query);
  const filter = { ...searchFilter(req.query, ['email', 'name', 'city']) };
  if (req.query.isBlocked !== undefined) filter.isBlocked = req.query.isBlocked === 'true';

  const [data, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(limit),
    User.countDocuments(filter)
  ]);

  paginatedResponse(res, { data: data.map((d) => d.toJSON()), total, page, limit });
};

// @desc    Get single user by id
// @route   GET /api/users/:id
// @access  Private/Admin
const getUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.status(200).json(user.toJSON());
};

// @desc    Block/unblock a user
// @route   PUT /api/users/:id/block
// @access  Private/Admin
const setUserBlocked = async (req, res) => {
  const { isBlocked } = req.body;
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isBlocked: !!isBlocked, updatedAt: new Date() },
    { new: true }
  );
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.status(200).json(user.toJSON());
};

// @desc    Delete a user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.status(200).json({ message: 'User removed successfully' });
};

module.exports = { getMyProfile, updateMyProfile, listUsers, getUser, setUserBlocked, deleteUser };
