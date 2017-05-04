/*
Copyright 2016 OffTheBricks - https://github.com/mircerlancerous/jsLight

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
var VC = (function(){
	//private properties and methods
	var self = (function(){
		return {
			//the full url to the views folder to use when relative paths are not reliable
			viewsURL: "views/",
			
			//ids for elements which should have the scroll position of the parent set to zero after reloading
			resetScroll: [],
			
			//default http headers to send with every xml http request - format is [{name: xx, value: yy}]
			xhrHeaders: [{name: "XHR", value: "true"}],
			
			//current views and their controllers and parent elements
			ViewObject: function(){
				this.view = "";             //the full path of the view loaded (account/signup.htm)
				this.viewName = "";         //just the name of the view (signup)
				this.elm = null;            //a reference to the DOM element the view was loaded into
				this.controller = null;     //a reference to the controller object assigned to the view
				this.html = null;           //an unaltered copy of the text/code/html loaded into the element
				this.obj = null;            //if the response was in JSON format, this contains the parse result
			},
			arrViewObj: [],
			
			//registered view change listeners
			viewChangeObj: function(){
				this.elm = null;
				this.viewName;
				this.onchange = function(newViewName){};
			},
			arrViewChangeObj: [],
			
			//set the supplied html to the element in the supplied viewObj. Initialize the view's controller if applicable
			setView: function(viewObj,html){
				viewObj.html = html;
				var obj = {};
				//check the html for a redirect command
				try{
					obj = JSON.parse(html);
					//only redirect if obj has only one property named 'vcview' with an optional vcelm property
					if(Object.getOwnPropertyNames(obj).length <= 2 && typeof(obj.vcview) === 'string'){
						var elm = viewObj.elm;
						if(typeof(obj.vcelm) === 'string'){
							if(obj.vcelm){
								elm = document.getElementById(obj.vcelm);
							}
							else{
								document.location = obj.vcview;
								return;
							}
						}
						VC.getView(elm,obj.vcview);
						return;
					}
					viewObj.obj = obj;
				}
				catch(e){}
				//get the old view in order to remove it
				var oldViewObj = VC.getViewObject(viewObj.elm);
				if(oldViewObj.elm){
					VC.deleteView(oldViewObj.elm,true);
				}
				//add the new view to the list
				self.arrViewObj[self.arrViewObj.length] = viewObj;
				//only set the view content if it's not JSON encoded
				if(typeof(html) === 'string' && viewObj.obj === null){
					viewObj.elm.innerHTML = html;
					//if this element needs its parent's scroll position reset
					if(self.resetScroll.length > 0 && viewObj.elm.id && self.resetScroll.indexOf(viewObj.elm.id) >= 0){
						//reset the element scroll position to the top as the browser won't do this with xhr
						var pelm = viewObj.elm;
						do{
							pelm.style.overflow = "hidden";		//for broadest compatibility
							pelm.scrollTop = 0;
							pelm.style.overflow = "";
							//reset the parent as well in case it's the element that was scrolling
							pelm = pelm.parentNode;
						} while(pelm == viewObj.elm.parentNode);	//this will run the loop twice
					}
				}
				var noOnLoad = true;
				//initialize controller if applicable
				if(typeof(window[viewObj.viewName]) === 'function'){
					//get parameters
					obj = {};
					var path = viewObj.view.split("?");
					if(path.length > 1){
						path = path[1];
						var parts = path.split("&");
						for(var i=0; i<parts.length; i++){
							var data = parts[i].split("=");
							obj[data[0]] = data[1];
						}
					}
					//init
					viewObj.controller = new window[viewObj.viewName](obj);
					//check if the controller implements onload
					if(typeof(viewObj.controller.onload) === 'function'){
						viewObj.controller.onload(viewObj);
						noOnLoad = false;
					}
				}
				//check if we need to manually call onviewload
				if(noOnLoad){
					VC.onviewload(viewObj);
				}
			},
			
			//detect all forms and anchors in the element in the supplied viewObj, and alter their behavior to use the view system
			setViewNavEvents: function(viewObj,elm){
				if(typeof(elm) === 'undefined'){
					elm = viewObj.elm;
				}
				//set all forms to post with doXHR and formData instead of normal submit
				var forms = elm.getElementsByTagName("form");
				for(var i=0; i<forms.length; i++){
					//if the form has a target set, then don't adjust it
					if(forms[i].target){
						continue;
					}
					forms[i].addEventListener("submit",function(event){
						event.preventDefault();
						event.stopPropagation();
						var formData = new FormData(this);
						//check if a submit button triggered this call - it will not be included in the FormData so we need to add it
						var aE = document.activeElement;
						if(aE && aE.tagName.toLowerCase() == 'input' && aE.type == 'submit' && aE.name){
							formData.append(aE.name,aE.value);
						}
						var view = this.action;
						if(view.length == 0 || view == document.baseURI){
							view = viewObj.view;
						}
						else{
							var href = document.baseURI;
							//either add a slash at the end, or remove a file from the base, or do nothing
							var temp = href.substring(href.lastIndexOf("/"));
							if(temp.indexOf(".") >= 0){
								href = href.substring(0,href.lastIndexOf("/"))+"/";
							}
							else if(temp.length > 1){
								href += "/";
							}
							view = view.replace(href,"");
						}
						var fElm = viewObj.elm;
						if(typeof (this.dataset.vcelm) !== 'undefined'){
							fElm = document.getElementById(this.dataset.vcelm);
							if (fElm === null) {
								fElm = viewObj.elm;
							}
							if(fElm.style.display == "none"){
								fElm.style.display = "";
							}
						}
						VC.getView(fElm,view,formData);
						return false;
					},false);
				}
				//set all anchors that have href and no target to load a view instead
				var alist = elm.getElementsByTagName("a");
				for(i=0; i<alist.length; i++){
					if(alist[i].href && !alist[i].target){
						alist[i].addEventListener("click",function(event){
							event.preventDefault();
							event.stopPropagation();
							var view = document.baseURI;
							//either add a slash at the end, or remove a file from the base, or do nothing
							var temp = view.substring(view.lastIndexOf("/"));
							if(temp.indexOf(".") >= 0){
								view = view.substring(0,view.lastIndexOf("/") + 1);
							}
							else if(temp.length > 1){
								view += "/";
							}
							view = this.href.replace(view,"");
							//if the anchor has specified a different view or url to load than the href - allows a nice looking link url with a different result
							if (typeof (this.dataset.vchref) !== 'undefined') {
								view = this.dataset.vchref;
							}
							else if(typeof(this.dataset.vcview) !== 'undefined'){
								var pos = view.indexOf("?");
								temp = "";
								if(pos >= 0){
									temp = view.substring(pos);
								}
								view = this.dataset.vcview + temp;
							}
							var aElm = viewObj.elm;
							//if the anchor is to target a different element
							if (typeof (this.dataset.vcelm) !== 'undefined') {
								aElm = document.getElementById(this.dataset.vcelm);
								if (aElm === null) {
									aElm = viewObj.elm;
								}
								if(aElm.style.display == "none"){
									aElm.style.display = "";
								}
							}
							VC.getView(aElm,view);
							return false;
						},false);
					}
				}
			}
		};
	})();

/*********************************************************************************/
	
	//public properties and methods
	return {
		//quick and easy xhr calls to the server with GET and or POST parameters
		doXHR: function(url,onload,formData,method,headers,responseType){
			var xmlhttp = new XMLHttpRequest();
			xmlhttp.onreadystatechange = function(){
				if(this.readyState == 4){
					if(typeof(onload) === 'function'){
						var responseStr = "";
						try{
							//this will fail if the response type is not convertible to string
							responseStr = this.responseText;
						}
						catch(e){
							onload(this.response,this.status);
							return;
						}
						onload(responseStr,this.status);
					}
				}
			};
			//set response type
			if(typeof(responseType) !== 'undefined' && responseType){
				xmlhttp.responseType = responseType;
			}
			//set http method
			if(typeof(method) === 'undefined' || !method){
				if(typeof(formData) === 'undefined' || !formData){
					method = "GET";
				}
				else{
					method = "POST";
				}
			}
			xmlhttp.open(method,url,true);
			//check for custom headers
			if(typeof(headers) === 'undefined'){
				headers = [];
			}
			if(headers && headers.length > 0){
				for(var i=0; i<headers.length; i++){
					//make sure the header value has been set
					if(typeof(headers[i].value) !== 'undefined'){
						xmlhttp.setRequestHeader(headers[i].name,headers[i].value);
					}
				}
			}
			//allow for override of default headers
			if(headers !== false){
				//check for default headers
				for(var i=0; i<self.xhrHeaders.length; i++){
					//skip if found in passed headers
					var found = false;
					for(var v=0; v<headers.length; v++){
						if(headers[v].name == self.xhrHeaders[i].name){
							found = true;
							break;
						}
					}
					if(found){
						continue;
					}
					//set default header
					xmlhttp.setRequestHeader(self.xhrHeaders[i].name,self.xhrHeaders[i].value);
				}
			}
			xmlhttp.send(formData);
		},
		
		//gets the supplied view and puts it into the supplied element. The view should be the path of the view inside the views folder
		getView: function(elm,view,formData,headers,alreadyLoaded){
			var viewObj = new self.ViewObject();
			viewObj.elm = elm;
			viewObj.view = view;
			viewObj.viewName = view;
			//strip extension from the view to get controller object name/view name
			var pos = viewObj.viewName.lastIndexOf(".");
			var poscheck = viewObj.viewName.lastIndexOf("/");
			if(pos > -1 && pos > poscheck){
				viewObj.viewName = viewObj.viewName.substring(0,pos);
			}
			else{
				pos = viewObj.viewName.lastIndexOf("?");
				if(pos > -1){
					viewObj.viewName = viewObj.viewName.substring(0,pos);
				}
			}
			//look for an appropriate controller and set the viewName to it
			pos = viewObj.viewName.split("/");
			for(var i=0; i<pos.length; i++){
				if(pos[i] && typeof(window[pos[i]]) === 'function'){
					viewObj.viewName = pos[i];
				}
			}
			
			//if the html for the view was loaded with the previous view or page load then we don't need to fetch it
			if(typeof(alreadyLoaded) !== 'undefined' && alreadyLoaded){
				self.setView(viewObj);
				return;
			}
			elm.style.opacity = "0.5";
			var url = self.viewsURL+view;
			if(view.search("http") > -1){
				url = view;
			}
			VC.doXHR(url,function(html,status){
				if(status !== 200 && status !== 0){
					alert("error loading content");
					elm.style.opacity = "";
					return;
				}
				self.setView(viewObj,html);
			},formData,headers);
		},
		
		//get the view object for the view currently in the supplied element - if not found, return null
		getViewObject: function(elm){
			var viewObj = new self.ViewObject();
			var arrViewObj = self.arrViewObj;
			//check if there is already a view in this element
			for(var i=0; i<arrViewObj.length; i++){
				if(arrViewObj[i].elm == elm){
					viewObj = arrViewObj[i];
					break;
				}
			}
			return viewObj;
		},
		
		//deletes the controller object and all references to the view
		deleteView: function(elm,prepForNew){
			var objArr = [];
			if(elm){
				//delete just the view for this element
				objArr[0] = VC.getViewObject(elm);
			}
			else{
				//delete all views
				objArr = self.arrViewObj;
			}
			for(var v=0; v<objArr.length; v++){
				var viewObj = objArr[v];
				//if there is a current view with a controller
				if(viewObj.controller){
					//clean out all event listeners that this view might have
					VC.clearViewChangeListeners(viewObj.viewName);
					//if the view controller has an onclose method
					if(typeof(viewObj.controller.onclose) === 'function'){
						viewObj.controller.onclose(viewObj);
					}
					delete viewObj.controller;
				}
				if(!elm){
					continue;
				}
				//remove the viewObject from the index
				for(var i=0; i<self.arrViewObj.length; i++){
					if(elm == self.arrViewObj[i].elm){
						self.arrViewObj.splice(i,1);
						break;
					}
				}
				if(typeof(prepForNew) === 'undefined' || !prepForNew){
					elm.innerHTML = "";
					//trigger an onchange for this element with a blank view object
					viewObj = new self.ViewObject();
					viewObj.elm = elm;
					VC.onviewload(viewObj);
				}
			}
		},
		
		//set a listener for changes to the view on the supplied element. Calls the supplied onchange when a change detected. Overwrites previous listeners on the same element for the supplied view
		setViewChangeListener: function(elm,viewName,onchange){
			var vcArr = self.arrViewChangeObj;
			//search for whether this view already has a listener registered for this element
			for(var i=0; i<vcArr.length; i++){
				if(elm == vcArr[i].elm && viewName == vcArr[i].viewName){
					//if onchange is not a function, then remove the listener
					if(typeof(onchange) !== 'function'){
						vcArr.splice(i,1);
					}
					else{
						vcArr[i].onchange = onchange;
					}
					return;
				}
			}
			vcArr[i] = new self.viewChangeObj();
			vcArr[i].elm = elm;
			vcArr[i].viewName = viewName;
			vcArr[i].onchange = onchange;
		},

		//removes all view change listeners for the supplied view. If viewName is undefined, then all listeners are removed
		clearViewChangeListeners: function(viewName){
			var arrVC = self.arrViewChangeObj;
			if(typeof(viewName) === 'undefined'){
				viewName = null;
			}
			if(typeof(trigger) === 'undefined'){
				trigger = true;
			}
			//search for and remove all listeners with the same viewName
			for(var i=arrVC.length - 1; i>=0; i--){
				if(viewName === null || arrVC[i].viewName == viewName){
					arrVC.splice(i,1);
				}
			}
		},
		
		//set the views url so that relative urls can be used in links and forms where they might not otherwise have been reliable
		setViewsURL: function(url){
			//ensure the last character is a /
			var last = url.substring(url.length-1);
			if(last != '/'){
				url += "/";
			}
			self.viewsURL = url;
		},
        
		//adds to the default headers to be sent with each xhr request. Param format is {name: xx, value: yy}
		addXHRHeader: function (headerObj) {
			self.xhrHeaders[self.xhrHeaders.length] = headerObj;
		},

		//removes a specific default header, or all of them if name is null or undefined
		removeXHRHeader: function(name){
			//if name is undefined or null
			if (typeof (name) === 'undefined' || !name) {
				var archive = self.xhrHeaders;
				//remove all default headers
				self.xhrHeaders = [];
				//return them so they can be restored if needed
				return archive;
			}
			else {
				//find the specific header and remove it
				for (var i = 0; i < self.xhrHeaders.length; i++)
				{
					if (self.xhrHeaders[i].name == name) {
						self.xhrHeaders.splice(i, 1);
						break;
					}
				}
			}
		},
		
		//detect all forms and anchors in the element in the supplied viewObj, and alter their behavior to use the view system
		setElmNavEvents: function(viewObj,elm){
			self.setViewNavEvents(viewObj,elm);
		},

		//called by a controller (usually from the controller's onstart) when the controller has finished loading
		onviewload: function(viewObj){
			self.setViewNavEvents(viewObj);
			viewObj.elm.style.opacity = "";
			var retArr = [];
			var vcArr = self.arrViewChangeObj;
			for(var i=0; i<vcArr.length; i++){
				if(viewObj.elm == vcArr[i].elm){
					var ret = vcArr[i].onchange(viewObj);
					//check if the onchange wants to return something to the view
					if(typeof(ret) !== 'undefined'){
						retArr[retArr.length] = ret;
					}
				}
			}
			return retArr;
		}
	}
})();
