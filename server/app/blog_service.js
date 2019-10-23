const { BloggerAdapter } = require('./blogger_adapter.js');
const { PhotosAdapter } = require('./google_photos_adapter.js');
const {GoogleDriveAdapter} = require('./google_drive_adapter.js');
const { listener_port, listener_host } = require('../configs/conf');
const { APIKeys } = require('../localconfigs/googleapi');
const { BrowserWindow } =  require('electron');
const { DOMParser } = require('xmldom');

/**
 * Handler for all blog related functionalities. 
 * Single point of interface with UI for most of the UI backend communications.
 * @author Aswin Rajeev
 */
class BlogService {

	constructor(messenger, blogUrl, fileSystem) {
		this.messenger = messenger;
		this.blogUrl = blogUrl;
		this.fs = fileSystem;
		this.photos = null;
		this.blogger = null;
	}

	/**
	 * Initializes the blog adapter(s) and server-side listeners
	 */
	initialize() {

		// creates a new instance of Blogger Adapter.
		this.blogger = new BloggerAdapter({
			apiConf: new APIKeys(), 
			appConf: {
				listener_port: listener_port,
				listener_host: listener_host
			}, 
			debugMode: false
		});

		this.drive = new GoogleDriveAdapter({
			apiConf: new APIKeys(), 
			appConf: {
				listener_port: listener_port,
				listener_host: listener_host
			}, 
			debugMode: false
		});

		this.initializeService();
	}

	/**
	 * Initializes the server-side listeners
	 */
	initializeService() {

		// blog service related listeners
		this.messenger.listen('publishblog', (data) => {
			this.publishBlogPost(this.blogUrl, data._title, data._content, false, data._postId);
		});
		this.messenger.listen('publishdraft', (data) => {
			this.publishBlogPost(this.blogUrl, data._title, data._content, true, data._postId);
		});

		// file system service relared listeners
		this.messenger.respond('fetchposts', (data) => {
			return this.fs.fetchPostsList();
		});
		this.messenger.respond('fetchFullPost', (data) => {
			return this.fs.fetchPostData(data.filename);
		});
		this.messenger.respond('savePost', (data) => {
			return this.fs.savePost(data.filename, data.postData);
		})

	}

	/**
	 * Publishes a post after authorizing with the user.
	 * 
	 * @param {*} blogURL - url of the blog
	 * @param {*} title - title of the blog post
	 * @param {*} contents - blog post contents
	 * @param {*} isDraft - flag to specify if the post is to be published as draft
	 * @param {*} postId - post id, if available.
	 */
	publishBlogPost(blogURL, title, contents, isDraft, postId) {
		this.seekAuthorization(blogURL, (result) => {
			this.publishPostData(result.id, title, contents, isDraft, postId);
		});
	}

	/**
	 * Open a new window and redirect to Google auth service
	 * 
	 * @param {*} blogUrl - URL of the blog
	 * @param {*} callback - callback function to be invoked after auth is completed
	 */
	seekAuthorization(blogUrl, callback) {
		var window = new BrowserWindow({
			height: 455,
			resizable: false,
			width: 370,
			title: 'Authorize',
			modal: true,
			minimizable: false,
			fullscreenable: false,
			show: false
		})
		
		// loads the authorization URL
		window.loadURL(this.blogger.generateAuthUrl());

		window.once('ready-to-show', () => {
			// opens the window
			window.show();
		})
		
		// listens for an acknowledgement
		const promise = this.blogger.awaitAuthorization({
			blogAPI: this.blogger.getBloggerAPI(),
			authClient: this.blogger.getAuth(),
		});

		promise.then(() => {

			// initializes the Photos API using the tokens
			var tokens = this.blogger.getTokens();

			this.drive.initialize({
				tokens: tokens
			});

			// get the details of the blog
			this.blogger.getBlogByUrl({
				blogAPI: this.blogger.getBloggerAPI(),
				authClient: this.blogger.getAuth(),
				url: blogUrl
			}).then((result) => {
				window.close();
				callback(result);
			})
		})
	}

	/**
	 * Reads the google photos blogly album id from config.
	 * If no config item present, create an album and then stores the config.
	 */
	async getOrCreatePhotoAlbum() {
		var albumId = this.fs.getConfigProperty('blogly-dir');

		if (albumId == null) {
			albumId = await this.drive.createFolder('Blogly');
			this.fs.setConfigProperty('blogly-dir', albumId, true);
		}

		return albumId;
	}

	/**
	 * Publishes the blog post, post auth.
	 * Also adds any images in the post to Google Photos Blogly album
	 * 
	 * @param {*} blogId - id corresponding to the blog, as returned by the Google auth service
	 * @param {*} title - title of the blog post
	 * @param {*} contents - contents of the blog post
	 * @param {*} isDraft - if to be saved as draft
	 * @param {*} postId - post id for an existing blog post
	 */
	async publishPostData(blogId, title, contents, isDraft, postId) {

		await this.uploadAllImages(contents);
		
		this.blogger.publish({
			blogAPI: this.blogger.getBloggerAPI(),
			authClient: this.blogger.getAuth(),
			blogId: blogId,
			isDraft: isDraft,
			postId: postId,
			blogPost: {
				title: title,
				content: contents
			}
		}).then((result) => {
			this.messenger.send('published', result);
		})
	}

	async uploadAllImages(content) {
		var dom = new DOMParser().parseFromString("<div>" + content + "</div>", "text/xml");
		var images = dom.getElementsByTagName('img');
		var imgData;

		if (images.length > 0 ) {
			var albumId = await this.getOrCreatePhotoAlbum();
			for(var i = 0; i < images.length; i++) {
				if (images[i].attributes != null && images[i].attributes.getNamedItem('src') != null) {
					imgData = images[i].attributes.getNamedItem('src').nodeValue;
					if (imgData != null && imgData.substring(0, 5) == 'data:') {
						var link = await this.uploadImage(imgData, albumId);
						content.replace(imgData, link);
					}
				}
			}
		}

	}

	async uploadImage(imageData, albumId) {
		var type = imageData.substring(11, imageData.indexOf(";base64"));
		var fileDetails = await this.fs.saveImage(imageData, type);
		var imageStream = this.fs.getFileReadStream(fileDetails.path);
		var res = await this.drive.uploadImage(albumId, fileDetails.imageFileName, imageStream, type);

		return fileDetails.path;
	}
}

module.exports.BlogService = BlogService;
