import { Injectable } from '@angular/core';
import { BlogPost } from 'client/app/models/blogpost';
import { MessagingService } from '../messagingservice/messaging.service';
import { EventEmitter } from 'events';
import { Blog } from 'client/app/models/blog';
import { AppManagerService } from '../appmanager/appmanager.service';
import { EventmanagerService } from '../event/eventmanager.service';

@Injectable({
  providedIn: 'root'
})
export class PostManagerService {

	// blog object data holder
  private __blogPost: BlogPost;
  private __postsList:BlogPost[];
  private newFun: Function;

  /**
   * Constructor for post manager service. Initializes the messenger service.
   * @param _messenger 
   */
  constructor(
    private _messenger: MessagingService,
    private __eventManager: EventmanagerService
    ) {}

  /**
   * Returns the current blog post data
   */
  getCurrentPost(): BlogPost {
    //return the blog object if exist, else initialize and return
    return this.__blogPost ? this.__blogPost : new BlogPost();
  }

  /**
   * Returns if the current post content is valid
   */
  isPostContentValid(isHTMLEditor): boolean {
    return (this.__blogPost != null && ((isHTMLEditor && this.__blogPost.htmlContent != null && this.__blogPost.htmlContent.trim() != '') ||
        ( !isHTMLEditor && this.__blogPost.content != null && this.__blogPost.content.trim() != '')))
  }

  /**
   * Sets the blog post id
   * @param id 
   */
  setPostId(id:String):void {
    this.__blogPost.postId = id;
  }

  /**
   * Sets the blog data
   * @param blog 
   */
  setPostData(blog:BlogPost) {
    this.__blogPost = blog;
  }

  /**
   * Publishes the current blog post
   * @param blog 
   * @param isDraft 
   */
  publishBlog(blog:Blog, isDraft) {
    var post = this.getCurrentPost();
    var postObj = {
      fileName: post.file,
      blog: blog.getAsBlog(),
      postData: post.getAsPost()
    };

    // listens for a confirmation from the server
    this._messenger.listen('published', (result) => {
      if (result.status == 200) {
        this.getCurrentPost().setPostURL(result.data.postURL);
        this.getCurrentPost().setPostId(result.data.postId);
        this.getCurrentPost().setContent(result.fullContent);
        this.getCurrentPost().setHTMLContent(result.data.content);
        this.getCurrentPost().setFile(result.data.filename);
        this.__blogPost = this.getCurrentPost();
      }
    }, post);

    if (isDraft) {
      this._messenger.send('publishdraft', postObj);
    } else {
      this._messenger.send('publishblog', postObj);
    }
    
  }

  /**
   * Returns the post list
   */
  getPostList():BlogPost[] {
    return this.__postsList;
  }

  /**
   * Fetches the post list from the back-end
   * @param callback 
   */
  fetchPostList(callback){
    this._messenger.request('fetchposts', null, (result:any) => {
      var posts:BlogPost[] = new Array<BlogPost>();
      var post: BlogPost;

      if (result != null && result.posts != null) {
        result.posts.forEach(data => {
          post = new BlogPost();
          post.title = data.title;
          post.itemId = data.itemId;
          post.miniContent = data.miniContent;
          post.file = data.filename;
          post.isSaved = true;

          posts.push(post);
        });
      }

      this.__postsList = posts;
      callback(posts);
    });
  }

  /**
   * Deletes a blog post
   * @param post 
   */
  deletePost(post:BlogPost) {
    this._messenger.listenOnce('deleted' + post.itemId, (result) => {
      if (result.status == 200) {
        this.__postsList.splice(this.__postsList.indexOf(post), 1);

        if (post.itemId == this.getCurrentPost().itemId && this.__postsList.length > 0) {
          this.setPost(this.__postsList[0], () => {
            // emit a ui updated event
           this.__eventManager.getUIEventEmitter().emit('uiUpdated');
          });
        } else if (this.__postsList.length == 0) {
          this.newFun();
        }

        // emit a ui updated event
        this.__eventManager.getUIEventEmitter().emit('uiUpdated');
      }
    }, {});

    if (post.file != null && post.file.trim() != '') {
      this._messenger.send('deletePost', {
        itemId: post.itemId
      });
    } else {
      // call the deleted event
      this._messenger.invoke('deleted' + post.itemId, {
        status: 200
      }, {});
    } 
  }

  /**
   * Sets the selected post as the active blog and renders it to the editor
   * @param post 
   * @param callback 
   */
  setPost(post:BlogPost, callback) {
    if (post.isSaved) {
      this._messenger.request('fetchFullPost', post.file, (result) => {
  
        if (result.status == 200) {
          var postObj = result.post;
          if (result != null) {
            post.title = postObj.title;
            post.itemId = postObj.itemId;
            post.postId = postObj.postId
            post.postURL = postObj.postURL;
            post.file = postObj.filename;
            post.isSaved = true;
            post.tags = postObj.tags;
            post.htmlContent = postObj.content;
            
            post.content = result.fullContent;
            
            this.__blogPost = post;
          }
        }
          
        // emit a ui updated event
        this.__eventManager.getUIEventEmitter().emit('uiUpdated');
        callback();
  
  
      });
    } else {
      this.__blogPost = post;

      // emit a ui updated event
      this.__eventManager.getUIEventEmitter().emit('uiUpdated');
      callback();
    }
  }

  /**
   * Saves the current blog post
   */
  saveCurrentPost() {
    var post = this.__blogPost;
    this._messenger.request('savePost', {
      filename: post.file,
      postData: post.getAsPost()
    }, (result) => {
      if (result != null && result.status == 200) {
        post.file = result.filename;
        this.__blogPost.setContent(result.fullContent);
        this.__blogPost.setHTMLContent(result.data.content);
        this.__blogPost.setItemId(result.data.itemId);
        this.__blogPost.setFile(result.data.filename);
        post.markDirty(false);

        // emit a ui updated event
        this.__eventManager.getUIEventEmitter().emit('uiUpdated');
      }
    });
  }

  /**
   * Exports a post to a file
   */
  exportCurrentPost() {
    var post = this.__blogPost;
    this._messenger.request('exportPost', {
      postData: post.getAsPost()
    }, (result) => {
      if (result != null && result.status == 200) {
        // emit a ui updated event
        this.__eventManager.getUIEventEmitter().emit('uiUpdated');
      }
    });
  }

  /**
   * Imports a post from a file and add it to the blogs list
   */
  importPost() {
    this._messenger.request('importPost', {

    }, (result) => {
      if (result != null && result.status == 200) {
          var post = new BlogPost();
          post.title = result.data.title;
          post.itemId = result.data.itemId;
          post.miniContent = result.data.miniContent;
          post.file = result.data.filename;
          post.isSaved = true;

          this.__postsList.unshift(post);
          this.setPost(post, () => {
            // emit a ui updated event
           this.__eventManager.getUIEventEmitter().emit('uiUpdated');
          });
      }
    })
  }

  // sets a function to be invoked when new button is pressed
  setNewPostAction(fun) {
    this.newFun = fun;
  }

  // invokes the new post action
  newPost() {
    this.newFun();
  }

}
