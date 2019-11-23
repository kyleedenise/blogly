import { Injectable } from '@angular/core';
import { BlogPost } from 'client/app/models/blogpost';
import { MessagingService } from '../messagingservice/messaging.service';
import { EventEmitter } from 'events';
import { Blog } from 'client/app/models/blog';

@Injectable({
  providedIn: 'root'
})
export class BlogService {

	// blog object data holder
  blogPost: BlogPost;
  postsList:BlogPost[];
  blogs: Blog[];
  newFun: Function;
  workspaceDir:String;

  htmlEditor: boolean = true;

  // event emitter for tracking post changes
  updateListener: EventEmitter = new EventEmitter();

  constructor(private _messenger: MessagingService) {}

  // returns the blog data
  getBlogData(): BlogPost {
    
    //return the blog object if exist, else initialize and return
    return this.blogPost ? this.blogPost : new BlogPost();
  }

  // returns if the current editor is HTML editor
  isHTMLEditor() {
    return !this.htmlEditor;
  }

  // sets the current editor as HTML if isHTML is true
  setHTMLEditor(isHTML:boolean) {
    this.htmlEditor = !isHTML;

    // emit a post updated event
    this.updateListener.emit("postUpdated");
  }

  // set the blog post id
  setPostId(id:String):void {
    this.blogPost.postId = id;
  }

  // set blog data to the service
  setBlogData(blog:BlogPost) {
    this.blogPost = blog;
  }

  // publish a blog post
  publishBlog(isDraft) {
    var post = this.getBlogData();
    var postObj = {
      fileName: post.file,
      postData: post.getAsPost()
    };

    // listens for a confirmation from the server
    this._messenger.listen('published', (result, channel, post) => {
      if (result.status == 200) {
        this.getBlogData().setPostURL(result.data.postURL);
        this.getBlogData().setPostId(result.data.postId);
        this.getBlogData().setContent(result.data.content);
        this.blogPost = this.getBlogData();
      }
    }, post);

    if (isDraft) {
      this._messenger.send('publishdraft', postObj);
    } else {
      this._messenger.send('publishblog', postObj);
    }
    
  }

  // returns the posts list
  getPostList():BlogPost[] {
    return this.postsList;
  }

  // retrieves the list of posts in the posts directory
  fetchPostList(callback){
    this._messenger.request('fetchposts', null, (result:any) => {
      var posts:BlogPost[] = new Array<BlogPost>();
      var post;

      if (result != null) {
        result.forEach(data => {
          post = new BlogPost();
          post.title = data.title;
          post.itemId = data.itemId;
          post.miniContent = data.miniContent;
          post.file = data.filename;
          post.isSaved = true;

          posts.push(post);
        });
      }

      this.postsList = posts;
      callback(posts);
    });
  }

  // retrieves the list of blogs saved
  fetchBlogs() {
    this._messenger.request('fetchBlogList', null, (result) => {
      if (this.blogs == null) {
        this.blogs = [];
      }
      result.blogs.forEach(blog => {
        this.blogs.push(new Blog(blog.name, blog.url, blog.postId));
      });
    });
  }

  // gets the blogs
  getBlogs():Blog[] {
    return this.blogs;
  }

  // deletes a post
  deletePost(post:BlogPost) {
    this._messenger.listenOnce('deleted' + post.itemId, (result) => {
      console.log(result);
      if (result.status == 200) {
        this.postsList.splice(this.postsList.indexOf(post), 1);

        if (post.itemId == this.getBlogData().itemId && this.postsList.length > 0) {
          this.setPost(this.postsList[0], () => {
            // emit a post updated event
            this.updateListener.emit("postUpdated");
          });
        }

        // emit a post updated event
        this.updateListener.emit("postUpdated");
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

  // sets the selected post as the active blog and renders it to the editor
  setPost(post:BlogPost, callback) {
    if (post.isSaved) {
      this._messenger.request('fetchFullPost', {filename: post.file}, (result) => {
  
        console.log(result);
  
        if (result != null) {
          post.content = result.content;
          post.title = result.title;
          post.itemId = result.itemId;
          post.postId = result.postId
          post.postURL = result.postURL;
          post.file = result.file;
          post.isSaved = true;
          this.blogPost = post;
        }
        
        // emit a post updated event
        this.updateListener.emit("postUpdated");
        callback();
  
      });
    } else {
      this.blogPost = post;

      // emit a post updated event
      this.updateListener.emit("postUpdated");
      callback();
    }
  }

  // saves the blog post
  saveCurrentPost() {
    var post = this.blogPost;
    this._messenger.request('savePost', {
      filename: post.file,
      postData: post.getAsPost()
    }, (result) => {
      if (result != null && result.status == 200) {
        post.file = result.filename;
        this.blogPost.setContent(result.data.content);
        this.blogPost.setItemId(result.data.itemId);
        this.blogPost.setFile(result.data.file);
        post.markDirty(false);

        // emit a post updated event
        this.updateListener.emit("postUpdated");
      }
    });
  }

  // requests for a select dir dialog and returns the selected path to worspace path
  selectWorkspaceDir() {
    this._messenger.request('selectDir', null, (dir) => {
      this.workspaceDir = dir;
      this.updateListener.emit('settingsUpdated');
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
