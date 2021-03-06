const { google } = require('googleapis');
const { AuthListener } = require('../../configs/conf');
const { APIKeys } = require('../../localconfigs/googleapi');

/**
 * Adapter for Google API
 * 
 * @author Aswin Rajeev
 */
class GoogleAPIAdapter {

	//TDOD: (Ref) https://stackoverflow.com/questions/1635800/javascript-best-singleton-pattern/6733919#6733919

	/**
	 * Singleton constructor for GoogleAPIAdapter
	 * 
	 * @param {*} args 
	 */
	constructor(args) {

		const defaultInstance = this.defaultInstance ? this.defaultInstance : this.constructor.defaultInstance;
		if (defaultInstance) {

			if (defaultInstance.debugMode) {
				console.debug("Instance already exists. Ignoring the arguments.");
			}

			return defaultInstance;
		}
		// Debug configurations
		this.debugMode = args.debugMode;

		// API holders
		this.blogger = null;
		this.drive = null;

		// token holders
		this.tokens = null;

		// create a google API authenticator
		this.authClient = new google.auth.OAuth2(
			APIKeys.CLIENT_ID,
			APIKeys.CLIENT_SECRET,
			`http://${AuthListener.LISTENER_HOST}:${AuthListener.LISTENER_PORT}`
		);

		// event handler for the token update
		this.authClient.on('tokens', (tokens) => {
			if (tokens.refresh_token) {

			}
		});

		// initialize blogger API
		this.blogger = google.blogger({
			version: 'v3',
			auth: this.authClient
		});

		// initialize drive API
		this.drive = google.drive({
			version: 'v3',
			auth: this.authClient
		});

		if (this.debugMode) {
			console.debug('Google API initialized.');
		}

		this.constructor.defaultInstance = this;

		/**
		 * Returns the default instance of the class
		 */
		this.constructor.getDefaultInstance = function() {
			const defaultInstance = this.constructor.defaultInstance;
			if (defaultInstance == null) {
				throw new Error('Class not initialized yet.');
			}

			return defaultInstance;
		}
	}

	/**
	 * Returns the Google Blogger API
	 */
	getBloggerAPI() {
		return this.blogger;
	}

	/**
	 * Returns the Google Drive API
	 */
	getDriveAPI() {
		return this.drive
	}

	/**
	 * Returns the API auth client
	 */
	getAuth() {
		return this.authClient;
	}

	/**
	 * Generates an authorization URL for the user
	 */	
	generateAuthUrl(scopes) {
		try {
			var authUrl = this.getAuth().generateAuthUrl({
				access_type: 'offline',
				scope: scopes
			});
	
			if (this.debugMode) {
				console.debug('Auth Url generated: ' + authUrl);
			}
	
			return authUrl;
		} catch (error) {
			console.error('Could not create auth URL.', error);
			throw error;
		}
	}

	/**
	 * Generates the tokens from the code
	 * 
	 * @param {*} code 
	 */
	async generateToken(code) {
		try {
			// awaits the tokens using the code
			const { tokens } = await this.getAuth().getToken(code);
	
			if (this.debugMode) {
				console.debug('Received tokens from Google server: ' + code);
			}
	
			return tokens;
		} catch (error) {
			console.error('Could not generate the auth tokens.', error);
			throw error;
		}
	}

	/**
	 * Initializes the adapter
	 * 
	 * @param {*} args 
	 */
	setCredentials(tokens) {
		try {
			this.tokens = tokens;
			this.getAuth().setCredentials(tokens);
	
			if (this.debugMode) {
				console.debug('Received credentials with tokens: ' + tokens);
			}
		} catch (error) {
			console.error('Could not set the credentials for Google API.', error);
			throw error;
		}
	}

}

module.exports.GoogleAPIAdapter = GoogleAPIAdapter;