 document.addEventListener('DOMContentLoaded', function() {
            const iframe = document.getElementById('preview');
            let selectedElement = null;
            let selectedElementId = null;
            let currentTheme = '#4361ee';
            
            // Initialize tabs
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    
                    this.classList.add('active');
                    document.getElementById(`${this.dataset.tab}-tab`).classList.add('active');
                });
            });
            
            // Initialize color picker
            document.querySelectorAll('.color-option').forEach(option => {
                option.addEventListener('click', function() {
                    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
                    this.classList.add('active');
                    currentTheme = this.dataset.color;
                    applyTheme();
                });
            });
            
            // Apply theme function
            function applyTheme() {
                const doc = iframe.contentDocument;
                doc.querySelectorAll('.btn, button').forEach(btn => {
                    btn.style.backgroundColor = currentTheme;
                });
                
                doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
                    heading.style.color = currentTheme;
                });
                
                refreshCodePreview();
            }
            
            // Wait for iframe to load
            iframe.addEventListener('load', function() {
                const doc = iframe.contentDocument;
                const designRoot = doc.getElementById('designRoot');
                
                // Set up selection handling
                doc.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Don't select the root element
                    if (e.target !== designRoot && designRoot.contains(e.target)) {
                        selectElement(e.target);
                    }
                }, true);
                
                // Set up delete key handling
                doc.addEventListener('keydown', function(e) {
                    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement && selectedElement !== designRoot) {
                        selectedElement.remove();
                        selectedElement = null;
                        selectedElementId = null;
                        updateSelectedInfo();
                        refreshCodePreview();
                        updateElementCount();
                    }
                });
                
                // Initial refresh
                refreshCodePreview();
                updateElementCount();
            });
            
            // Add element buttons
            document.querySelectorAll('.element-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const tag = this.getAttribute('data-tag');
                    addElement(tag);
                });
            });
            
            // Add component buttons
            document.querySelectorAll('button[data-component]').forEach(btn => {
                btn.addEventListener('click', function() {
                    const component = this.getAttribute('data-component');
                    addComponent(component);
                });
            });
            
            // Delete button
            document.getElementById('delete-btn').addEventListener('click', function() {
                if (selectedElement) {
                    selectedElement.remove();
                    selectedElement = null;
                    selectedElementId = null;
                    updateSelectedInfo();
                    refreshCodePreview();
                    updateElementCount();
                }
            });
            
            // Clear button
            document.getElementById('clear-btn').addEventListener('click', function() {
                const doc = iframe.contentDocument;
                const designRoot = doc.getElementById('designRoot');
                designRoot.innerHTML = '<h1>Welcome to Website Builder</h1><p>Click on elements to select them. Use the left panel to add new elements.</p>';
                selectedElement = null;
                selectedElementId = null;
                updateSelectedInfo();
                refreshCodePreview();
                updateElementCount();
            });
            
            // Change tag button
            document.getElementById('change-tag').addEventListener('click', function() {
                if (selectedElement) {
                    const newTag = document.getElementById('tag-input').value.trim();
                    if (newTag && /^[a-z][a-z0-9]*$/i.test(newTag)) {
                        const doc = iframe.contentDocument;
                        const newElement = doc.createElement(newTag);
                        
                        // Copy attributes and content
                        while (selectedElement.firstChild) {
                            newElement.appendChild(selectedElement.firstChild);
                        }
                        
                        Array.from(selectedElement.attributes).forEach(attr => {
                            newElement.setAttribute(attr.name, attr.value);
                        });
                        
                        selectedElement.parentNode.replaceChild(newElement, selectedElement);
                        selectElement(newElement);
                        refreshCodePreview();
                    }
                }
            });
            
            // Download button
            document.getElementById('download-btn').addEventListener('click', function() {
                const doc = iframe.contentDocument;
                const designRoot = doc.getElementById('designRoot');
                const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            padding: 20px; 
            max-width: 1200px; 
            margin: 0 auto; 
            color: #333;
        }
        .btn { 
            background: ${currentTheme}; 
            color: white; 
            padding: 12px 20px; 
            border: none; 
            border-radius: 6px; 
            cursor: pointer; 
            display: inline-block;
            text-decoration: none;
            font-weight: 600;
            transition: background 0.3s;
        }
        .btn:hover { 
            background: ${getDarkerColor(currentTheme)}; 
        }
        h1, h2, h3, h4, h5, h6 {
            color: ${currentTheme};
            margin-top: 0;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        a {
            color: ${currentTheme};
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    ${designRoot.innerHTML}
</body>
</html>`;
                
                const blob = new Blob([htmlContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = 'my-website.html';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
            
            // Copy code button
            document.getElementById('copy-code').addEventListener('click', function() {
                const code = document.getElementById('html-code').textContent;
                navigator.clipboard.writeText(code).then(() => {
                    const originalText = this.innerHTML;
                    this.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => {
                        this.innerHTML = originalText;
                    }, 2000);
                });
            });
            
            // Function to add a new element
            function addElement(tag) {
                const doc = iframe.contentDocument;
                const designRoot = doc.getElementById('designRoot');
                
                // Create the new element
                const el = doc.createElement(tag);
                
                // Set sensible defaults based on tag type
                switch(tag) {
                    case 'img':
                        el.src = 'https://placehold.co/800x400?text=Image+Placeholder';
                        el.alt = 'Placeholder image';
                        el.style.display = 'block';
                        el.style.maxWidth = '100%';
                        el.style.borderRadius = '8px';
                        break;
                    case 'a':
                        el.href = 'https://example.com';
                        el.textContent = 'Example Link';
                        el.className = 'btn';
                        break;
                    case 'button':
                        el.textContent = 'Click Me';
                        el.className = 'btn';
                        break;
                    case 'ul':
                    case 'ol':
                        for (let i = 1; i <= 3; i++) {
                            const li = doc.createElement('li');
                            li.textContent = `Item ${i}`;
                            el.appendChild(li);
                        }
                        break;
                    case 'h1':
                        el.textContent = 'Heading 1';
                        break;
                    case 'h2':
                        el.textContent = 'Heading 2';
                        break;
                    case 'p':
                        el.textContent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
                        break;
                    case 'section':
                        const h2 = doc.createElement('h2');
                        h2.textContent = 'Section Title';
                        const p = doc.createElement('p');
                        p.textContent = 'Section content goes here. You can edit this text with the properties panel.';
                        el.append(h2, p);
                        el.style.padding = '30px';
                        el.style.margin = '20px 0';
                        el.style.background = '#f8f9fa';
                        el.style.borderRadius = '12px';
                        break;
                    case 'footer':
                        el.innerHTML = '&copy; ' + new Date().getFullYear() + ' My Website. All rights reserved.';
                        el.style.padding = '30px';
                        el.style.marginTop = '40px';
                        el.style.background = '#343a40';
                        el.style.color = 'white';
                        el.style.textAlign = 'center';
                        el.style.borderRadius = '12px';
                        break;
                    case 'div':
                        el.style.padding = '20px';
                        el.style.margin = '15px 0';
                        el.style.border = '2px dashed #e9ecef';
                        el.style.borderRadius = '12px';
                        el.textContent = 'Container content';
                        break;
                }
                
                // Add to the design root or selected element
                if (selectedElement && selectedElement !== designRoot) {
                    selectedElement.appendChild(el);
                } else {
                    designRoot.appendChild(el);
                }
                
                // Select the new element
                selectElement(el);
                refreshCodePreview();
                updateElementCount();
            }
            
            // Function to add a component
            function addComponent(component) {
                const doc = iframe.contentDocument;
                const designRoot = doc.getElementById('designRoot');
                
                let html = '';
                
                switch(component) {
                    case 'hero':
                        html = `
                            <section style="padding: 80px 20px; text-align: center; background: #f8f9fa; border-radius: 12px;">
                                <h1>Welcome to Our Website</h1>
                                <p style="max-width: 600px; margin: 20px auto; font-size: 1.2rem;">
                                    This is a hero section. You can customize it with your own content.
                                </p>
                                <a href="#" class="btn">Get Started</a>
                            </section>
                        `;
                        break;
                    case 'nav':
                        html = `
                            <nav style="display: flex; justify-content: space-between; align-items: center; padding: 20px; background: #f8f9fa; border-radius: 12px; margin-bottom: 30px;">
                                <div style="font-weight: bold; font-size: 1.5rem;">Logo</div>
                                <ul style="display: flex; list-style: none; gap: 20px;">
                                    <li><a href="#">Home</a></li>
                                    <li><a href="#">About</a></li>
                                    <li><a href="#">Services</a></li>
                                    <li><a href="#">Contact</a></li>
                                </ul>
                            </nav>
                        `;
                        break;
                    case 'contact':
                        html = `
                            <section style="padding: 40px; background: #f8f9fa; border-radius: 12px;">
                                <h2>Contact Us</h2>
                                <form style="display: grid; gap: 15px; max-width: 600px;">
                                    <input type="text" placeholder="Your Name" style="padding: 12px; border: 1px solid #ddd; border-radius: 6px;">
                                    <input type="email" placeholder="Your Email" style="padding: 12px; border: 1px solid #ddd; border-radius: 6px;">
                                    <textarea placeholder="Your Message" rows="4" style="padding: 12px; border: 1px solid #ddd; border-radius: 6px;"></textarea>
                                    <button type="submit" class="btn">Send Message</button>
                                </form>
                            </section>
                        `;
                        break;
                    case 'pricing':
                        html = `
                            <section style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 40px 0;">
                                <div style="padding: 30px; background: white; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); text-align: center;">
                                    <h3>Basic</h3>
                                    <p style="font-size: 2rem; margin: 20px 0;">$9.99<span style="font-size: 1rem;">/month</span></p>
                                    <ul style="list-style: none; padding: 0; margin: 20px 0;">
                                        <li>Feature 1</li>
                                        <li>Feature 2</li>
                                        <li>Feature 3</li>
                                    </ul>
                                    <a href="#" class="btn">Get Started</a>
                                </div>
                                <div style="padding: 30px; background: white; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); text-align: center;">
                                    <h3>Pro</h3>
                                    <p style="font-size: 2rem; margin: 20px 0;">$19.99<span style="font-size: 1rem;">/month</span></p>
                                    <ul style="list-style: none; padding: 0; margin: 20px 0;">
                                        <li>Feature 1</li>
                                        <li>Feature 2</li>
                                        <li>Feature 3</li>
                                        <li>Feature 4</li>
                                    </ul>
                                    <a href="#" class="btn">Get Started</a>
                                </div>
                                <div style="padding: 30px; background: white; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); text-align: center;">
                                    <h3>Enterprise</h3>
                                    <p style="font-size: 2rem; margin: 20px 0;">$29.99<span style="font-size: 1rem;">/month</span></p>
                                    <ul style="list-style: none; padding: 0; margin: 20px 0;">
                                        <li>Feature 1</li>
                                        <li>Feature 2</li>
                                        <li>Feature 3</li>
                                        <li>Feature 4</li>
                                        <li>Feature 5</li>
                                    </ul>
                                    <a href="#" class="btn">Get Started</a>
                                </div>
                            </section>
                        `;
                        break;
                }
                
                // Create a temporary container to hold the HTML
                const tempDiv = doc.createElement('div');
                tempDiv.innerHTML = html;
                
                // Add to the design root or selected element
                if (selectedElement && selectedElement !== designRoot) {
                    selectedElement.appendChild(tempDiv);
                } else {
                    designRoot.appendChild(tempDiv);
                }
                
                refreshCodePreview();
                updateElementCount();
            }
            
            // Function to select an element
            function selectElement(element) {
                const doc = iframe.contentDocument;
                
                // Remove previous selection
                if (selectedElement) {
                    selectedElement.classList.remove('selected');
                }
                
                // Set new selection
                selectedElement = element;
                selectedElement.classList.add('selected');
                
                // Update UI
                updateSelectedInfo();
                updatePropertiesPanel();
            }
            
            // Update selected element info
            function updateSelectedInfo() {
                const infoEl = document.getElementById('selected-info');
                
                if (selectedElement) {
                    infoEl.textContent = `Selected: <${selectedElement.tagName.toLowerCase()}>`;
                    document.getElementById('tag-input').value = selectedElement.tagName.toLowerCase();
                } else {
                    infoEl.textContent = 'No element selected';
                    document.getElementById('tag-input').value = '';
                }
            }
            
            // Update element count
            function updateElementCount() {
                const doc = iframe.contentDocument;
                const designRoot = doc.getElementById('designRoot');
                const count = designRoot.querySelectorAll('*').length;
                document.getElementById('element-count').textContent = count;
            }
            
            // Update properties panel
            function updatePropertiesPanel() {
                const propsPanel = document.getElementById('properties-content');
                
                if (!selectedElement) {
                    propsPanel.innerHTML = '<p>Select an element to edit its properties</p>';
                    return;
                }
                
                let html = `
                    <h3><i class="fas fa-edit"></i> Edit ${selectedElement.tagName.toLowerCase()}</h3>
                    <label>Text Content:</label>
                    <textarea id="prop-text" rows="3">${selectedElement.textContent}</textarea>
                    
                    <label>ID:</label>
                    <input type="text" id="prop-id" value="${selectedElement.id}">
                    
                    <label>Class:</label>
                    <input type="text" id="prop-class" value="${selectedElement.className}">
                `;
                
                // Special properties for specific elements
                if (selectedElement.tagName.toLowerCase() === 'img') {
                    html += `
                        <label>Image Source:</label>
                        <input type="text" id="prop-src" value="${selectedElement.src}">
                        
                        <label>Alt Text:</label>
                        <input type="text" id="prop-alt" value="${selectedElement.alt}">
                    `;
                }
                
                if (selectedElement.tagName.toLowerCase() === 'a') {
                    html += `
                        <label>Link URL:</label>
                        <input type="text" id="prop-href" value="${selectedElement.href}">
                    `;
                }
                
                // Add style properties
                html += `
                    <h3><i class="fas fa-paint-brush"></i> Styles</h3>
                    <label>Background Color:</label>
                    <input type="color" id="prop-bg-color" value="#ffffff">
                    
                    <label>Text Color:</label>
                    <input type="color" id="prop-color" value="#000000">
                    
                    <label>Padding:</label>
                    <input type="text" id="prop-padding" placeholder="e.g., 10px">
                    
                    <label>Margin:</label>
                    <input type="text" id="prop-margin" placeholder="e.g., 10px">
                    
                    <button id="apply-props" class="btn-success" style="margin-top: 10px; width: 100%;"><i class="fas fa-check"></i> Apply Properties</button>
                `;
                
                propsPanel.innerHTML = html;
                
                // Set current style values
                const computedStyle = iframe.contentWindow.getComputedStyle(selectedElement);
                document.getElementById('prop-bg-color').value = rgbToHex(computedStyle.backgroundColor);
                document.getElementById('prop-color').value = rgbToHex(computedStyle.color);
                document.getElementById('prop-padding').value = computedStyle.padding;
                document.getElementById('prop-margin').value = computedStyle.margin;
                
                // Add event listener for apply button
                document.getElementById('apply-props').addEventListener('click', applyProperties);
            }
            
            // Convert RGB to Hex
            function rgbToHex(rgb) {
                if (!rgb || rgb === 'rgba(0, 0, 0, 0)' || rgb === 'transparent') return '#ffffff';
                
                const rgbValues = rgb.match(/\d+/g);
                if (!rgbValues || rgbValues.length < 3) return '#000000';
                
                return '#' + ((1 << 24) + (parseInt(rgbValues[0]) << 16) + (parseInt(rgbValues[1]) << 8) + parseInt(rgbValues[2])).toString(16).slice(1);
            }
            
            // Get darker color for hover states
            function getDarkerColor(hex) {
                let r = parseInt(hex.slice(1, 3), 16);
                let g = parseInt(hex.slice(3, 5), 16);
                let b = parseInt(hex.slice(5, 7), 16);
                
                r = Math.max(0, r - 30);
                g = Math.max(0, g - 30);
                b = Math.max(0, b - 30);
                
                return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
            }
            
            // Apply properties from panel to element
            function applyProperties() {
                if (!selectedElement) return;
                
                selectedElement.textContent = document.getElementById('prop-text').value;
                selectedElement.id = document.getElementById('prop-id').value;
                selectedElement.className = document.getElementById('prop-class').value;
                
                if (selectedElement.tagName.toLowerCase() === 'img') {
                    selectedElement.src = document.getElementById('prop-src').value;
                    selectedElement.alt = document.getElementById('prop-alt').value;
                }
                
                if (selectedElement.tagName.toLowerCase() === 'a') {
                    selectedElement.href = document.getElementById('prop-href').value;
                }
                
                // Apply styles
                selectedElement.style.backgroundColor = document.getElementById('prop-bg-color').value;
                selectedElement.style.color = document.getElementById('prop-color').value;
                selectedElement.style.padding = document.getElementById('prop-padding').value;
                selectedElement.style.margin = document.getElementById('prop-margin').value;
                
                refreshCodePreview();
            }
            
            // Refresh code preview
            function refreshCodePreview() {
                const doc = iframe.contentDocument;
                const designRoot = doc.getElementById('designRoot');
                document.getElementById('html-code').textContent = designRoot.innerHTML;
            }
        });