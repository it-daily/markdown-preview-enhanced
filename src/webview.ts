// preview controller
(function() {
console.log('init webview')

interface MarkdownConfig {
  scrollSync?: boolean,
  mathRenderingOption?: string,
  imageFolderPath?: string,
  imageUploader?: string
  vscode?: boolean
}

/**
 * .mpe-toolbar {
 *   .refresh-btn
 *   .back-to-top-btn
 *   .sidebar-toc-btn
 * }
 */
interface Toolbar {
  toolbar: HTMLElement,
  backToTopBtn: HTMLElement,
  refreshBtn: HTMLElement,
  sidebarTOCBtn: HTMLElement
}

interface MarkdownPreviewEnhancedPreview {
 /**
   * whether finished loading preview
   */
  doneLoadingPreview: boolean

 /**
  * .preview-container element 
  */
  containerElement: HTMLElement,

 /**
  * this is the element with class `mume`
  * the final html is rendered by that previewElement
  */
  previewElement: HTMLElement,

  /**
   * .mume.hidden-preview element
   * hiddenPreviewElement is used to render html and then put the rendered html result to previewElement
   */
  hiddenPreviewElement: HTMLElement,

  /**
   * Toolbar object
   */
  toolbar: Toolbar,

  /**
   * whether to enable sidebar toc
   */
  enableSidebarTOC: boolean

  /**
   * .sidebar-toc element
   */
  sidebarTOC:HTMLElement

  /**
   * .sidebar-toc element innerHTML generated by markdown-engine.ts
   */
  sidebarTOCHTML:string

  /**
   * zoom level
   */
  zoomLevel:number

  /**
   * .refreshing-icon element
   */
  refreshingIcon:HTMLElement
  refreshingIconTimeout

  /**
   * scroll map 
   */
  scrollMap: Array<number>

  /**
   * TextEditor total buffer line count
   */
  totalLineCount: number

  /**
   * TextEditor cursor current line position
   */
  currentLine: number


  previewScrollDelay: number 
  editorScrollDelay: number

  /**
   * whether enter presentation mode
   */ 
  presentationMode: boolean


  /**
   * track the slide line number, and (h, v) indices
   */
  slidesData: Array<{line:number, h:number, v:number, offset:number}>

  /**
   * Current slide offset 
   */
  currentSlideOffset: number

  /**
   * setTimeout value
   */
  scrollTimeout: any

}

let $:JQuery = null

/**
 * This config is the same as the one defined in `config.ts` file
 */
let config:MarkdownConfig = {}

/**
 * markdown file URI 
 */
let sourceUri = null

/**
 * mpe object 
 */
let mpe: MarkdownPreviewEnhancedPreview = null

function postMessage(command:string, args:any[]=[]) {
  if (config['vscode']) { // post message to vscode
    window.parent.postMessage({ 
      command: 'did-click-link',
      data: `command:_mume.${command}?${JSON.stringify(args)}`
    }, 'file://')
  } else {
    window.parent.postMessage({
      command,
      args
    }, 'file://')
  }
}

function onLoad() {  
  $ = window['$'] as JQuery

  /** init preview elements */
  const previewElement = document.getElementsByClassName('mume')[0] as HTMLElement
  const hiddenPreviewElement = document.createElement("div")
  hiddenPreviewElement.classList.add('mume')
  hiddenPreviewElement.classList.add('hidden-preview')
  hiddenPreviewElement.setAttribute('for', 'preview')
  hiddenPreviewElement.style.zIndex = '0'
  previewElement.insertAdjacentElement('beforebegin', hiddenPreviewElement)

  /** init contextmenu */
  initContextMenu()

  /** load config */
  config = JSON.parse(document.getElementById('mume-data').getAttribute('data-config'))
  sourceUri = config['sourceUri']

  // console.log(document.getElementsByTagName('html')[0].innerHTML)
  // console.log(JSON.stringify(config))

  /** init mpe object */
  mpe = {
    doneLoadingPreview: false,
    containerElement: document.body,
    previewElement,
    hiddenPreviewElement,
    currentLine: config['line'] || -1,
    scrollMap: null,
    previewScrollDelay: 0,
    editorScrollDelay: 0,
    totalLineCount: 0,
    scrollTimeout: null,
    presentationMode: previewElement.hasAttribute('data-presentation-mode'),
    slidesData: [],
    currentSlideOffset: -1,
    toolbar: {
      toolbar: document.getElementById('md-toolbar') as HTMLElement,
      backToTopBtn: document.getElementsByClassName('back-to-top-btn')[0] as HTMLElement,
      refreshBtn: document.getElementsByClassName('refresh-btn')[0] as HTMLElement,
      sidebarTOCBtn: document.getElementsByClassName('sidebar-toc-btn')[0] as HTMLElement
    },
    enableSidebarTOC: false,
    sidebarTOC: null,
    sidebarTOCHTML: "",
    zoomLevel: 1,
    refreshingIcon: document.getElementsByClassName('refreshing-icon')[0] as HTMLElement, 
    refreshingIconTimeout: null
  }

  /** init toolbar event */
  initToolbarEvent()

  /** init image helper */
  initImageHelper()

  if (!mpe.presentationMode) {
    previewElement.onscroll = scrollEvent

    postMessage('webviewFinishLoading', [sourceUri])
  } else { // TODO: presentation preview to source sync
    initPresentationEvent()
  }
  
  // console.log(document.getElementsByTagName('html')[0].outerHTML)
}

/**
 * init events for tool bar
 */
function initToolbarEvent() {    
    const toolbarElement = mpe.toolbar.toolbar
    const showToolbar = ()=> toolbarElement.style.opacity = "1"
    mpe.previewElement.onmouseenter = showToolbar
    mpe.toolbar.toolbar.onmouseenter = showToolbar
    mpe.previewElement.onmouseleave = ()=> toolbarElement.style.opacity = "0"

    initSideBarTOCButton()
    initBackToTopButton()
    initRefreshButton()

    return toolbar
}

/**
 * init .sidebar-toc-btn
 */
function initSideBarTOCButton() {

  mpe.toolbar.sidebarTOCBtn.onclick = ()=> {
    if (mpe.presentationMode) {
      return window['Reveal'].toggleOverview()
    }

    mpe.enableSidebarTOC = !mpe.enableSidebarTOC

    if (mpe.enableSidebarTOC) {
      mpe.sidebarTOC = document.createElement('div') // create new sidebar toc
      mpe.sidebarTOC.classList.add('md-sidebar-toc')
      mpe.containerElement.appendChild(mpe.sidebarTOC)
      mpe.containerElement.classList.add('show-sidebar-toc')
      renderSidebarTOC()
      setZoomLevel()
    } else {
      if (mpe.sidebarTOC) mpe.sidebarTOC.remove()
      mpe.sidebarTOC = null
      mpe.containerElement.classList.remove('show-sidebar-toc')
      mpe.previewElement.style.width = "100%"
    }

    mpe.scrollMap = null 
  }
}

/**
 * init .back-to-top-btn
 */
function initBackToTopButton() {
  mpe.toolbar.backToTopBtn.onclick = ()=> {
    if (mpe.presentationMode) {
      return window['Reveal'].slide(0)
    }

    mpe.previewElement.scrollTop = 0
  }
}

/**
 * init .refresh-btn
 */
function initRefreshButton() {
  mpe.toolbar.refreshBtn.onclick = ()=> {
    postMessage('refreshPreview', [sourceUri])
  }
}

/**
 * init contextmenu
 * reference: http://jsfiddle.net/w33z4bo0/1/
 */
function initContextMenu() {
  $["contextMenu"]({
    selector: '.preview-container',
    items: {
      "open_in_browser": {
        name: "Open in Browser", 
        callback: ()=>{     
          postMessage('openInBrowser', [sourceUri])
        } 
      },
      "sep1": "---------",
      "html_export": {
        name: "HTML",
        items: {
          "html_offline": {
            name: "HTML (offline)",
            callback() {
              postMessage('htmlExport', [sourceUri, true])
            }
          },
          "html_cdn": {
            name: "HTML (cdn hosted)",
            callback() {
              postMessage('htmlExport', [sourceUri, false])
            }
          }
        }
      },
      "phantomjs_export": 
      {
        name: "PhantomJS",
        items: {
          "phantomjs_pdf": {
            name: "PDF",
            callback() {
              postMessage('phantomjsExport', [sourceUri, 'pdf'])
            }
          },
          "phantomjs_png": {
            name: "PNG",
            callback() {
              postMessage('phantomjsExport', [sourceUri, 'png'])
            }
          },
          "phantomjs_jpeg": {
            name: "JPEG",
            callback() {
              postMessage('phantomjsExport', [sourceUri, 'jpeg'])
            }
          }
        }
      },
      "prince_export": 
      {
        name: "PDF (prince)",
        callback: ()=> {
          postMessage('princeExport', [sourceUri])
        }
      },
      "ebook_export": {
        name: "eBook",
        items: {
          "ebook_epub": {
            name: "ePub",
            callback: ()=> {
              postMessage('eBookExport', [sourceUri, 'epub'])
            }
          },
          "ebook_mobi": {
            name: "mobi",
            callback: ()=> {
              postMessage('eBookExport', [sourceUri, 'mobi'])
            }
          },
          "ebook_pdf": {
            name: "PDF",
            callback: ()=> {
              postMessage('eBookExport', [sourceUri, 'pdf'])
            }
          },
          "ebook_html": {
            name: "HTML",
            callback: ()=> {
              postMessage('eBookExport', [sourceUri, 'html'])
            }
          }
        }
      },
      "pandoc_export": {
        name: "Pandoc",
        callback: ()=> {
          postMessage('pandocExport', [sourceUri])
        }
      },
      "save_as_markdown": {
        name: "Save as Markdown",
        callback: ()=> {
          postMessage('markdownExport', [sourceUri])
        }
      },
      "sep2": "---------",
      "sync_source": {
        name: "Sync Source",
        callback: ()=> {
          previewSyncSource()
        }
      }
    }
  })
}

/**
 * init image helper
 */
function initImageHelper() {
  const imageHelper = document.getElementById("image-helper-view")

  // url editor
  // used to insert image url
  const urlEditor = imageHelper.getElementsByClassName('url-editor')[0] as HTMLInputElement
  urlEditor.addEventListener('keypress', (event:KeyboardEvent)=> {
    if (event.keyCode === 13) { // enter key pressed 
      let url = urlEditor.value.trim()
      if (url.indexOf(' ') >= 0) {
        url = `<${url}>`
      }
      if (url.length) {
        $['modal'].close() // close modal
        postMessage('insertImageUrl', [sourceUri, url])
      }
      return false 
    } else {
      return true 
    }
  })

  const copyLabel = imageHelper.getElementsByClassName('copy-label')[0] as HTMLLabelElement
  copyLabel.innerText = `Copy image to ${config.imageFolderPath[0] == '/' ? 'root' : 'relative'} ${config.imageFolderPath} folder`

  const imageUploaderSelect = imageHelper.getElementsByClassName('uploader-select')[0] as HTMLSelectElement
  imageUploaderSelect.value = config.imageUploader

  // drop area has 2 events:
  // 1. paste(copy) image to imageFolderPath
  // 2. upload image
  const dropArea = window['$']('.drop-area', imageHelper)
  const fileUploader = window['$']('.file-uploader', imageHelper)
  dropArea.on('drop dragend dragstart dragenter dragleave drag dragover', (e)=> {
    e.preventDefault()
    e.stopPropagation()
    if (e.type == "drop") {
      if (e.target.className.indexOf('paster') >= 0) { // paste
        const files = e.originalEvent.dataTransfer.files
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          postMessage('pasteImageFile', [sourceUri, file.path])
        }
      } else { // upload
        const files = e.originalEvent.dataTransfer.files
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          postMessage('uploadImageFile', [sourceUri, file.path, imageUploaderSelect.value])
        }
      }
      $['modal'].close() // close modal
    }
  })
  dropArea.on('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      window['$'](this).find('input[type="file"]').click()
      $['modal'].close() // close modal
  })
  fileUploader.on('click', (e)=>{
    e.stopPropagation()
  })
  fileUploader.on('change', (e)=> {
    if (e.target.className.indexOf('paster') >= 0) { // paste
      const files = e.target.files
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        postMessage('pasteImageFile', [sourceUri, file.path])
      }
      fileUploader.val('')
    } else { // upload
      const files = e.target.files
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        postMessage('uploadImageFile', [sourceUri, file.path, imageUploaderSelect.value])
      }
      fileUploader.val('')
    }
  })
}

function initPresentationEvent() {
  window['Reveal'].addEventListener( 'ready', function( event ) {
    initSlidesData()

    // slide to initial position
    window['Reveal'].configure({transition: 'none'})
    scrollToRevealSourceLine(config['initialLine'])
    window['Reveal'].configure({transition: 'slide'})

    // several events...
    setupCodeChunks()
    bindTagAClickEvent()
    bindTaskListEvent()

    // scroll slides
    window['Reveal'].addEventListener('slidechanged', (event)=> {
      if (Date.now() < mpe.previewScrollDelay) return 

      const {indexh, indexv} = event
      for (let i = 0; i < mpe.slidesData.length; i++) {
        const {h, v, line} = mpe.slidesData[i]
        if (h === indexh && v === indexv) {
          postMessage('revealLine', [sourceUri, line + 6])
        }
      }
    })
  })
}

/**
 * render mermaid graphs
 */
function renderMermaid() {
  return new Promise((resolve, reject)=> {
    const mermaid = window['mermaid'] // window.mermaid doesn't work, has to be written as window['mermaid']
    const mermaidAPI = window['mermaidAPI']
    const mermaidGraphs = mpe.hiddenPreviewElement.getElementsByClassName('mermaid')

    const validMermaidGraphs = []
    // const mermaidCodes = []
    for (let i = 0; i < mermaidGraphs.length; i++) {
      const mermaidGraph = mermaidGraphs[i] as HTMLElement
      // if (mermaidGraph.getAttribute('data-processed') === 'true') continue 

      mermaid.parseError = function(err) {
        mermaidGraph.innerHTML = `<pre class="language-text">${err.toString()}</pre>`
      }

      if (mermaidAPI.parse(mermaidGraph.textContent.trim())) {
        validMermaidGraphs.push(mermaidGraph)
        // mermaidCodes.push(mermaidGraph.textContent)
      }
    }

    if (!validMermaidGraphs.length) return resolve()

    mermaid.init(null, validMermaidGraphs, function(){
      resolve()
    })
  })
}

/**
 * render MathJax expressions
 */
function renderMathJax() {
  return new Promise((resolve, reject)=> {
    if (config['mathRenderingOption'] === 'MathJax' || config['usePandocParser']) {
      const MathJax = window['MathJax']
      // .mathjax-exps, .math.inline, .math.display
      const unprocessedElements = mpe.hiddenPreviewElement.querySelectorAll('.mathjax-exps, .math.inline, .math.display')
      if (!unprocessedElements.length) return resolve()

      window['MathJax'].Hub.Queue(
        ['Typeset', MathJax.Hub, mpe.hiddenPreviewElement], 
        [function() {
          // sometimes the this callback will be called twice
          // and only the second time will the Math expressions be rendered.
          // therefore, I added the line below to check whether math is already rendered.  
          if (!mpe.hiddenPreviewElement.getElementsByClassName('MathJax').length) return
          
          mpe.scrollMap = null
          return resolve()
        }])
    } else {
      return resolve()
    }
  })
}

function runCodeChunk(id:string) {
  const codeChunk = document.querySelector(`.code-chunk[data-id="${id}"]`)
  const running = codeChunk.classList.contains('running')
  if (running) return 
  codeChunk.classList.add('running')

  if (codeChunk.getAttribute('data-cmd') === 'javascript') { // javascript code chunk
    const code = codeChunk.getAttribute('data-code')
    try {
      eval(`((function(){${code}$})())`)
      codeChunk.classList.remove('running') // done running javascript code 

      const CryptoJS = window["CryptoJS"]
      const result = CryptoJS.AES.encrypt(codeChunk.getElementsByClassName('output-div')[0].outerHTML, "mume").toString()

      postMessage('cacheCodeChunkResult', [sourceUri, id, result])
    } catch(e) {
      const outputDiv = codeChunk.getElementsByClassName('output-div')[0]
      outputDiv.innerHTML = `<pre>${e.toString()}</pre>`
    }
  } else {
    postMessage('runCodeChunk', [sourceUri, id])
  }
}

function runAllCodeChunks() {
  const codeChunks = mpe.previewElement.getElementsByClassName('code-chunk')
  for (let i = 0; i < codeChunks.length; i++) {
    codeChunks[i].classList.add('running')
  }

  postMessage('runAllCodeChunks', [sourceUri])
}

function runNearestCodeChunk() {
  const currentLine = mpe.currentLine
  const elements = mpe.previewElement.children
  for (let i = elements.length - 1; i >= 0; i--) {
    if (elements[i].classList.contains('sync-line') && elements[i + 1] && elements[i + 1].classList.contains('code-chunk')) {
      if (currentLine >= parseInt(elements[i].getAttribute('data-line'))) {
        const codeChunkId = elements[i + 1].getAttribute('data-id')
        return runCodeChunk(codeChunkId)
      }
    }
  }
}

/**
 * Setup code chunks
 */
function setupCodeChunks() {
  const codeChunks = mpe.previewElement.getElementsByClassName('code-chunk')
  if (!codeChunks.length) return 

  let needToSetupCodeChunkId = false 

  for (let i = 0; i < codeChunks.length; i++) {
    const codeChunk = codeChunks[i],
          id = codeChunk.getAttribute('data-id')

    // bind click event 
    const runBtn = codeChunk.getElementsByClassName('run-btn')[0]
    const runAllBtn = codeChunk.getElementsByClassName('run-all-btn')[0]
    if (runBtn) {
      runBtn.addEventListener('click', ()=> {
        runCodeChunk(id)
      })
    }
    if (runAllBtn) {
      runAllBtn.addEventListener('click', ()=> {
        runAllCodeChunks()
      })
    }
  }
}

/**
 * render sidebar toc 
 */
function renderSidebarTOC() {
  if (!mpe.enableSidebarTOC) return
  if (mpe.sidebarTOCHTML) {
    mpe.sidebarTOC.innerHTML = mpe.sidebarTOCHTML
  } else {
    mpe.sidebarTOC.innerHTML = `<p style="text-align:center;font-style: italic;">Outline (empty)</p>`
  }
}

/**
 * init several preview events
 */
async function initEvents() {
  await Promise.all([
    renderMathJax(), 
    renderMermaid()
  ])
  mpe.previewElement.innerHTML = mpe.hiddenPreviewElement.innerHTML
  mpe.hiddenPreviewElement.innerHTML = ""

  setupCodeChunks()

  if (mpe.refreshingIconTimeout) {
    clearTimeout(mpe.refreshingIconTimeout)
    mpe.refreshingIconTimeout = null
  }
  mpe.refreshingIcon.style.display = "none"
}

function bindTagAClickEvent() {
  const as = mpe.previewElement.getElementsByTagName('a')
  for (let i = 0; i < as.length; i++) {
    const a = as[i]
    const href =  a.getAttribute('href')
    if (href && href[0] === '#') {
      // anchor, do nothing 
    } else {
      a.onclick = (event)=> {
        event.preventDefault()
        event.stopPropagation()

        postMessage('clickTagA', [sourceUri, encodeURIComponent(href)])
      }
    }
  }
}

function bindTaskListEvent() {
  const taskListItemCheckboxes = mpe.previewElement.getElementsByClassName('task-list-item-checkbox')
  for (let i = 0; i < taskListItemCheckboxes.length; i++) {
    const checkbox = taskListItemCheckboxes[i] as HTMLInputElement
    let li = checkbox.parentElement
    if (li.tagName !== 'LI') li = li.parentElement
    if (li.tagName === 'LI') {
      li.classList.add('task-list-item')

      // bind checkbox click event
      checkbox.onclick = (event)=> {
        event.preventDefault()

        let checked = checkbox.checked
        if (checked) {
          checkbox.setAttribute('checked', '')  
        } else {
          checkbox.removeAttribute('checked')
        }

        const dataLine = parseInt(checkbox.getAttribute('data-line'))
        if (!isNaN(dataLine)) {
          postMessage('clickTaskListCheckbox', [sourceUri, dataLine])
        }
      }
    }
  }
}

/**
 * update previewElement innerHTML content
 * @param html 
 */
function updateHTML(html:string, id:string, classes:string) {
  // If it's now presentationMode, then this function shouldn't be called.
  // If this function is called, then it might be in the case that 
  //   1. Using singlePreview 
  //   2. Switch from a presentationMode file to not presentationMode file.
  if (mpe.presentationMode) {
    postMessage('refreshPreview', [sourceUri])
  }

  // editorScrollDelay = Date.now() + 500
  mpe.previewScrollDelay = Date.now() + 500

  mpe.hiddenPreviewElement.innerHTML = html


  const scrollTop = mpe.previewElement.scrollTop
  // init several events 
  initEvents().then(()=> {
    mpe.scrollMap = null 

    bindTagAClickEvent()
    bindTaskListEvent()

    // set id and classes
    mpe.previewElement.id = id || ''
    mpe.previewElement.setAttribute('class', `mume ${classes}`)
    
    // scroll to initial position 
    if (!mpe.doneLoadingPreview) {
      mpe.doneLoadingPreview = true
      scrollToRevealSourceLine(config['initialLine'])

      // clear @scrollMap after 2 seconds because sometimes
      // loading images will change scrollHeight.
      setTimeout(()=> mpe.scrollMap = null, 2000) 
    } else { // restore scrollTop
      mpe.previewElement.scrollTop = scrollTop // <= This line is necessary...
    }
  })
}

/**
 * Build offsets for each line (lines can be wrapped)
 * That's a bit dirty to process each line everytime, but ok for demo.
 * Optimizations are required only for big texts.
 * @return array
 */
function buildScrollMap():Array<number> {
  if (!mpe.totalLineCount) return null
  const _scrollMap = [],
        nonEmptyList = []
  
  for (let i = 0; i < mpe.totalLineCount; i++) {
    _scrollMap.push(-1)
  }

  nonEmptyList.push(0)
  _scrollMap[0] = 0

  // write down the offsetTop of element that has 'data-line' property to _scrollMap
  const lineElements = mpe.previewElement.getElementsByClassName('sync-line')

  for (let i = 0; i < lineElements.length; i++) {
    let el = lineElements[i] as HTMLElement
    let t:any = el.getAttribute('data-line')
    if (!t) continue

    t = parseInt(t)
    if(!t) continue

    // this is for ignoring footnote scroll match
    if (t < nonEmptyList[nonEmptyList.length - 1])
      el.removeAttribute('data-line')
    else {
      nonEmptyList.push(t)

      let offsetTop = 0
      while (el && el !== mpe.previewElement) {
        offsetTop += el.offsetTop
        el = el.offsetParent as HTMLElement
      }

      _scrollMap[t] = Math.round(offsetTop)
    }
  }

  nonEmptyList.push(mpe.totalLineCount)
  _scrollMap.push(mpe.previewElement.scrollHeight)

  let pos = 0
  for (let i = 0; i < mpe.totalLineCount; i++) {
    if (_scrollMap[i] !== -1) {
      pos++
      continue
    }

    let a = nonEmptyList[pos - 1]
    let b = nonEmptyList[pos]
    _scrollMap[i] = Math.round((_scrollMap[b] * (i - a) + _scrollMap[a] * (b - i)) / (b - a))
  }

  return _scrollMap  // scrollMap's length == screenLineCount (vscode can't get screenLineCount... sad)
}

function scrollEvent() { 
  if (!config.scrollSync) return

  if (!mpe.scrollMap) {
    mpe.scrollMap = buildScrollMap()
    return 
  }

  if ( Date.now() < mpe.previewScrollDelay ) return 
  previewSyncSource()
}

function previewSyncSource() {
  let scrollToLine

  if (mpe.previewElement.scrollTop === 0) {
    // editorScrollDelay = Date.now() + 100
    scrollToLine = 0

    postMessage('revealLine', [sourceUri, scrollToLine])
    return 
  }

  let top = mpe.previewElement.scrollTop + mpe.previewElement.offsetHeight / 2

  // try to find corresponding screen buffer row
  if (!mpe.scrollMap) mpe.scrollMap = buildScrollMap()

  let i = 0
  let j = mpe.scrollMap.length - 1
  let count = 0
  let screenRow = -1 // the screenRow is the bufferRow in vscode.
  let mid 

  while (count < 20) {
    if (Math.abs(top - mpe.scrollMap[i]) < 20) {
      screenRow = i
      break
    } else if (Math.abs(top - mpe.scrollMap[j]) < 20) {
      screenRow = j
      break
    } else {
      mid = Math.floor((i + j) / 2)
      if (top > mpe.scrollMap[mid])
        i = mid
      else
        j = mid
    }
    count++
  }

  if (screenRow == -1)
    screenRow = mid

  scrollToLine = screenRow

  postMessage('revealLine', [sourceUri, scrollToLine])
  // @scrollToPos(screenRow * @editor.getLineHeightInPixels() - @previewElement.offsetHeight / 2, @editor.getElement())
  // # @editor.getElement().setScrollTop

  // track currnet time to disable onDidChangeScrollTop
  // editorScrollDelay = Date.now() + 100
}

function setZoomLevel () {
  mpe.previewElement.style.zoom = mpe.zoomLevel.toString()
  if (mpe.enableSidebarTOC) {
    mpe.previewElement.style.width = `calc(100% - ${268 / mpe.zoomLevel}px)`
  }
  mpe.scrollMap = null
}

function initSlidesData() {
  const slideElements = document.getElementsByTagName('section')
  let offset = 0
  for (let i = 0; i < slideElements.length; i++) {
    const slide = slideElements[i]
    if (slide.hasAttribute('data-line')) {
      const line = parseInt(slide.getAttribute('data-line')),
            h = parseInt(slide.getAttribute('data-h')),
            v = parseInt(slide.getAttribute('data-v'))
      mpe.slidesData.push({line, h, v, offset})
      offset += 1
    }
  }
}

/**
 * scroll sync to display slide according `line`
 * @param: line: the buffer row of editor
 */
function scrollSyncToSlide(line:number) {
  for (let i = mpe.slidesData.length - 1; i >= 0; i--) {
    if (line >= mpe.slidesData[i].line) {
      const {h, v, offset} = mpe.slidesData[i]
      if (offset === mpe.currentSlideOffset) return
      
      mpe.currentSlideOffset = offset
      window['Reveal'].slide(h, v)
      break
    }
  }
}

/**
 * scroll preview to match `line`
 * @param line: the buffer row of editor
 */
function scrollSyncToLine(line:number, topRatio:number = 0.372) {
  if (!mpe.scrollMap) mpe.scrollMap = buildScrollMap()
  if (!mpe.scrollMap || line >= mpe.scrollMap.length) return

  /**
   * Since I am not able to access the viewport of the editor 
   * I used `golden section` here for scrollTop.  
   */
  scrollToPos(Math.max(mpe.scrollMap[line] - mpe.previewElement.offsetHeight * topRatio, 0))
}

/**
 * Smoothly scroll the previewElement to `scrollTop` position.  
 * @param scrollTop: the scrollTop position that the previewElement should be at
 */
function scrollToPos(scrollTop) {
  if (mpe.scrollTimeout) {
    clearTimeout(mpe.scrollTimeout)
    mpe.scrollTimeout = null
  }

  if (scrollTop < 0) return 

  const delay = 10

  function helper(duration=0) {
    mpe.scrollTimeout = setTimeout(() => {
      if (duration <= 0) {
        mpe.previewScrollDelay = Date.now() + 500
        mpe.previewElement.scrollTop = scrollTop
        return
      }

      const difference = scrollTop - mpe.previewElement.scrollTop

      const perTick = difference / duration * delay

      // disable preview onscroll
      mpe.previewScrollDelay = Date.now() + 500

      mpe.previewElement.scrollTop += perTick
      if (mpe.previewElement.scrollTop == scrollTop) return 

      helper(duration-delay)
    }, delay)
  }

  const scrollDuration = 120
  helper(scrollDuration)
}

/**
 * It's unfortunate that I am not able to access the viewport.  
 * @param line 
 */
function scrollToRevealSourceLine(line, topRatio=0.372) {
  if (!config.scrollSync || line === mpe.currentLine) {
    return 
  } else {
    mpe.currentLine = line
  }

  // disable preview onscroll
  mpe.previewScrollDelay = Date.now() + 500

  if (mpe.presentationMode) {
    scrollSyncToSlide(line)
  } else {
    scrollSyncToLine(line, topRatio)
  }
}


function resizeEvent() {
  mpe.scrollMap = null
}

window.addEventListener('message', (event)=> {
  const data = event.data 
  if (!data) return 
  
  // console.log('receive message: ' + data.command)

  if (data.command === 'updateHTML') {
    mpe.totalLineCount = data.totalLineCount
    mpe.sidebarTOCHTML = data.tocHTML
    sourceUri = data.sourceUri
    renderSidebarTOC()
    updateHTML(data.html, data.id, data.class)
  } else if (data.command === 'changeTextEditorSelection') {
    const line = parseInt(data.line)
    let topRatio = parseFloat(data.topRatio)
    if (isNaN(topRatio)) topRatio = 0.372
    scrollToRevealSourceLine(line, topRatio)
  } else if (data.command === 'startParsingMarkdown') {
    /**
     * show refreshingIcon after 1 second
     * if preview hasn't finished rendering.
     */
    if (mpe.refreshingIconTimeout) clearTimeout(mpe.refreshingIconTimeout)

    mpe.refreshingIconTimeout = setTimeout(()=> {
      if (!mpe.presentationMode) {
        mpe.refreshingIcon.style.display = "block"
      }
    }, 1000)
  } else if (data.command === 'openImageHelper') {
    window['$']('#image-helper-view').modal()
  } else if (data.command === 'run-all-code-chunks') {
    runAllCodeChunks()
  } else if (data.command === 'runCodeChunk') {
    runNearestCodeChunk()
  }
}, false);

window.addEventListener('resize', resizeEvent)

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onLoad);
} else {
  onLoad();
}
})()