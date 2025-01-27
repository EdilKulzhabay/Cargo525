const mongoose = require("mongoose")

const UserSchema = new mongoose.Schema(
    {
        phone: {
            type: String,
            required: true
        },
        status: {
            type: Boolean,
            default: false
        },
        language: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", UserSchema);