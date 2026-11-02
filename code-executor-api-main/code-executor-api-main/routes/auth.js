
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const pool = require("../config/db");
const dynamodb = require("../config/dynamodb");

const router = express.Router();
const USERS_TABLE = "CodeExecutionUsers";

router.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    if (
        typeof username !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string"
    ) {
        return res.status(400).json({
            error: "Invalid request body"
        });
    }

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedUsername || !normalizedEmail || !password.trim()) {
        return res.status(400).json({
            error: "All fields are required"
        });
    }

    if (normalizedUsername.length < 3) {
        return res.status(400).json({
            error: "Username must be at least 3 characters long"
        });
    }

    if (normalizedUsername.length > 30) {
        return res.status(400).json({
            error: "Username cannot exceed 30 characters"
        });
    }

    if (!validator.isEmail(normalizedEmail)) {
        return res.status(400).json({
            error: "Invalid email address"
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            error: "Password must be at least 8 characters long"
        });
    }

    const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordRegex.test(password)) {
        return res.status(400).json({
            error: "Password must contain uppercase, lowercase, number and special character"
        });
    }

    try {
        const existing = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [normalizedEmail]
        );

        if (existing.rowCount > 0) {
            return res.status(409).json({
                error: "Email already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (username, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, username, email`,
            [normalizedUsername, normalizedEmail, hashedPassword]
        );

        const user = result.rows[0];
        const now = new Date().toISOString();

        // Synchronize safe account metadata with DynamoDB.
        await dynamodb.send(
            new PutCommand({
                TableName: USERS_TABLE,
                Item: {
                    // CodeExecutionUsers partition key is String.
                    userId: String(user.id),
                    displayName: user.username,
                    email: user.email,
                    role: "USER",
                    accountStatus: "ACTIVE",
                    createdAt: now,
                    lastLoginAt: null
                },
                ConditionExpression: "attribute_not_exists(userId)"
            })
        );

        console.log("User metadata saved to DynamoDB", {
            userId: String(user.id)
        });

        return res.status(201).json(user);

    } catch (err) {
        console.error("Registration or DynamoDB synchronization failed:", {
            name: err.name,
            code: err.code || err.name
        });

        // A PostgreSQL insert may already have succeeded.
        return res.status(500).json({
            error: "Registration could not be completed across all services. Check the account before retrying."
        });
    }
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (
        typeof email !== "string" ||
        typeof password !== "string"
    ) {
        return res.status(400).json({
            error: "Invalid request body"
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
        const result = await pool.query(
            `SELECT id, username, email, password_hash
             FROM users WHERE email = $1`,
            [normalizedEmail]
        );

        if (result.rowCount === 0) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!match) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });

    } catch (err) {
        console.error("Login failed:", {
            name: err.name,
            code: err.code || err.name
        });

        return res.status(500).json({
            error: "Internal server error"
        });
    }
});

module.exports = router;
