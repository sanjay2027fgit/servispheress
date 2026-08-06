const Admin = require('../models/Admin');

// @desc    Get all admins
// @route   GET /api/admin
// @access  Private/Admin
const getAdmins = async (req, res) => {
  try {
    const admins = await Admin.find();
    res.status(200).json(admins);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admins', error: error.message });
  }
};

// @desc    Create new admin
// @route   POST /api/admin
// @access  Private/Admin
const createAdmin = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Please add all required fields: name, email, password, role' });
    }

    // Check if admin already exists
    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ message: 'Admin already exists' });
    }

    const admin = await Admin.create({
      name,
      email,
      password,
      role
    });

    if (admin) {
      res.status(201).json(admin);
    } else {
      res.status(400).json({ message: 'Invalid admin data' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error creating admin', error: error.message });
  }
};

// @desc    Update admin
// @route   PUT /api/admin/:id
// @access  Private/Admin
const updateAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    Object.assign(admin, req.body);
    const updatedAdmin = await admin.save();

    res.status(200).json(updatedAdmin);
  } catch (error) {
    res.status(500).json({ message: 'Error updating admin', error: error.message });
  }
};

// @desc    Delete admin
// @route   DELETE /api/admin/:id
// @access  Private/Admin
const deleteAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    await Admin.findByIdAndDelete(req.params.id);

    res.status(200).json({ id: req.params.id, message: 'Admin removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting admin', error: error.message });
  }
};

module.exports = {
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin
};
