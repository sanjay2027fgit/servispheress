const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri || /<[^>]+>/.test(uri)) {
    console.error('MongoDB URI is invalid or still uses a placeholder value. Update MONGO_URI in the .env file.');
    return;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB Connection Error:', error.message);
    console.warn('Continuing without MongoDB connection. Some features may be unavailable.');
  }
};

module.exports = connectDB;