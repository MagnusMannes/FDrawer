Tool to create BHA components that can be exported as JSONs or transfered to BHA building applications such as FDiagram.
No data is saved and stored from the user.
Application can be used at https://magnusmannes.github.io/FDrawer/

### Embedding

Another application can preload a component by opening the page with a
`component` query parameter containing a URL encoded JSON object:

```
window.open('index.html?component=' +
  encodeURIComponent(JSON.stringify(myComponent)), '_blank');
```

If an opener is present or a component was supplied this way, a **Finished**
button will appear. Clicking it posts the updated component back to the opener
using the `newComponent` message before closing the window.

Alternatively, the component can be sent to an already opened editor using
`postMessage`:

```
const win = window.open('index.html', '_blank');
win.postMessage({ component: myComponent }, '*');
```

![image](https://github.com/user-attachments/assets/7831bf8b-3fc6-44e1-bf2b-22e632ae586d)
