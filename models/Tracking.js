// models/Tracking.js

import mongoose from 'mongoose';

const TrackingSchema = new mongoose.Schema({
  url: { type: String, required: true },
  email: { type: String },
  latestPrice: { type: String },     // 💰 new
  lastChecked: { type: Date },       // 🕒 new
}, { timestamps: true });

export default mongoose.models.Tracking || mongoose.model('Tracking', TrackingSchema);
