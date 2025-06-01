// models/Tracking.js
import mongoose from 'mongoose';

const TrackingSchema = new mongoose.Schema({
  url: { type: String, required: true },
  email: { type: String },
  price: { type: String, default: '-' },        // ✅ must match all code
  lastChecked: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.models.Tracking || mongoose.model('Tracking', TrackingSchema);
