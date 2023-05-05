'use strict';

const db = require('../db');
const bcrypt = require('bcrypt');
const { sqlForPartialUpdate } = require('../helpers/sql');
const {
	NotFoundError,
	BadRequestError,
	UnauthorizedError,
} = require('../expressError');

const { BCRYPT_WORK_FACTOR } = require('../config.js');

class User {
	/** authenticate user with username, password.
	 *
	 * Returns { id, username, first_name, last_name, email}
	 *
	 * Throws UnauthorizedError is user not found or wrong password.
	 **/
	static async authenticate(username, password) {
		// try to find the user first
		const result = await db.query(
			`
        SELECT id,
               username,
               password,
               first_name AS "firstName",
               last_name  AS "lastName",
               email
        FROM users
        WHERE username = $1`,
			[username]
		);

		const user = result.rows[0];

		if (user) {
			// compare hashed password to a new hash from password
			const isValid = await bcrypt.compare(password, user.password);
			if (isValid === true) {
				delete user.password;
				return user;
			}
		}

		throw new UnauthorizedError('Invalid username/password');
	}

	/** Register user with data.
	 *
	 * Returns { username, firstName, lastName, email }
	 *
	 * Throws BadRequestError on duplicates.
	 **/
	static async register({ username, password, firstName, lastName, email }) {
		const duplicateCheck = await db.query(
			`
      SELECT username
      FROM users
      WHERE username = $1`,
			[username]
		);

		if (duplicateCheck.rows.length > 0) {
			throw new BadRequestError(`Duplicate username: ${username}`);
		}

		const hashedPassword = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);

		const result = await db.query(
			`
              INSERT INTO users
              (username,
               password,
               first_name,
               last_name,
               email)
              VALUES ($1, $2, $3, $4, $5)
              RETURNING
                  id,
                  username,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  email`,
			[username, hashedPassword, firstName, lastName, email]
		);

		const user = result.rows[0];

		return user;
	}

	/** Find all users.
	 *
	 * Returns [{ id, username, first_name, last_name, email, is_admin }, ...]
	 **/

	static async getAll() {
		const result = await db.query(
			`
    SELECT id,
           username,
           password,
           first_name as firstName,
           last_name as lastName,
           email
      FROM users
  ORDER BY username
    `
		);
		return result.rows;
	}

	/**
	 * Get data about user by username.
	 * @param {string} username - The username of the user to retrieve.
	 * @returns {Object} User data:
	 *   { id, username, firstName, lastName, listings, bookings, conversations }
	 *   - listings: [{ id, name, description, price, street, city, state, zip, genre }]
	 *   - bookings: [{ id, owner_id, renter_id, listing_id, created_at }]
	 *   - conversations: [{ id, renter_id, owner_id, listing_id }]
	 * @throws {NotFoundError} If user not found.
	 */
	static async get(username) {
		const userResult = await db.query(
			`SELECT id, username, first_name AS firstName, last_name AS lastName, email
       FROM users
      WHERE username = $1`,
			[username]
		);
		const user = userResult.rows[0];
		if (!user) throw new NotFoundError(`User not found: ${username}`);

		const listingsResult = await db.query(
			`SELECT id, name, description, price, street, city, state, zip, genre
         FROM listings
        WHERE owner_id = $1
     ORDER BY id`,
			[user.id]
		);
		user.listings = listingsResult.rows;

		const bookingsResult = await db.query(
			`SELECT id, owner_id, renter_id, listing_id, created_at
         FROM bookings
        WHERE renter_id = $1
     ORDER BY id`,
			[user.id]
		);
		user.bookings = bookingsResult.rows;

		const conversationsResult = await db.query(
			`SELECT id, renter_id, owner_id, listing_id
		  	 FROM conversations
				WHERE owner_id = $1 OR renter_id = $1
		 ORDER BY id`,
			[user.id]
		);
		user.conversations = conversationsResult.rows;

		return user;
	}

	/** Update user data with `data`. (partial update)
	 *
	 * Data can include:
	 *   { firstName, lastName, password, email }
	 *
	 * Returns { id, username, firstName, lastName, email }
	 *
	 * Throws NotFoundError if not found.
	 *
	 */

	static async update(id, data) {
		if (data.password) {
			data.password = await bcrypt.hash(data.password, BCRYPT_WORK_FACTOR);
		}

		const { setCols, values } = sqlForPartialUpdate(data, {
			firstName: 'first_name',
			lastName: 'last_name',
		});
		const idVarIdx = '$' + (values.length + 1);

		const querySql = `
      UPDATE users
      SET ${setCols}
      WHERE id = ${idVarIdx}
      RETURNING id,
          first_name AS "firstName",
          last_name AS "lastName",
          email`;
		const result = await db.query(querySql, [...values, id]);
		const user = result.rows[0];

		if (!user) throw new NotFoundError(`No user: ${id}`);

		delete user.password;
		return user;
	}
	/** Delete given user from database; returns undefined. */

	static async remove(id) {
		let result = await db.query(
			`
        DELETE
        FROM users
        WHERE id = $1
        RETURNING id`,
			[id]
		);
		const user = result.rows[0];

		if (!user) throw new NotFoundError(`No user: ${id}`);
	}
}

module.exports = User;
