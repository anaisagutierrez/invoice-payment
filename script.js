// Import auth and db from firebaseConfig.js
import { auth, db } from './firebaseConfig.js';

document.addEventListener('DOMContentLoaded', () => {

    // Check if the user is logged in
    auth.onAuthStateChanged(user => {
        if (user) {
            // User is signed in. The rest of your application logic goes here.
            // Check for admin status based on email
            // const isAdminEmail = 'anaisagutierrez@gmail.com'; 
            // Change this to your admin email
            // const isAdmin = user.email === isAdminEmail;

            const adminEmails = ['anaisagutierrez@gmail.com', 'eacordero173@gmail.com']; // Change this to your admin emails
            const isAdmin = adminEmails.includes(user.email);

           
            // Show or hide admin controls based on user status
            const adminToggleContainer = document.getElementById('admin-toggle-container');
            if(adminToggleContainer) {
                adminToggleContainer.style.display = isAdmin ? 'flex' : 'none';
            }
            const adminToggle = document.getElementById('admin-toggle');
            if(adminToggle) {
                adminToggle.checked = isAdmin;
            }

            // Set the isAdmin flag globally for the rest of the script
            window.isAdmin = isAdmin;
            
            
            // Set the page title
            document.title = 'Invoice Manager';

            const dataContainer = document.getElementById('data-container');
            const firebaseBaseUrl = 'https://language-entry-default-rtdb.firebaseio.com/invoices';

            // Create a div for the toast/status message
            const statusMessageDiv = document.createElement('div');
            statusMessageDiv.id = 'status-message';
            statusMessageDiv.className = 'fixed top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg opacity-0 transition-opacity duration-300 pointer-events-none z-50';
            document.body.appendChild(statusMessageDiv);

            // Create the comment modal overlay and content
            const commentModalOverlay = document.createElement('div');
            commentModalOverlay.id = 'comment-modal-overlay';
            commentModalOverlay.className = 'fixed inset-0 bg-black bg-opacity-50 hidden flex items-center justify-center z-40';
            commentModalOverlay.innerHTML = `
                <div id="comment-modal-content" class="bg-white p-6 rounded-lg shadow-xl w-11/12 md:w-1/2 lg:w-1/3 relative">
                    <h3 class="text-xl font-bold mb-4 text-gray-800">Comments</h3>
                    <div id="existing-comments" class="max-h-48 overflow-y-auto mb-4 p-2 bg-gray-100 rounded-md border border-gray-300 text-sm text-gray-700">
                        <p>No comments yet.</p>
                    </div>
                    <textarea id="comment-textarea" class="w-full h-20 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Add a new comment..."></textarea>
                    <div class="mt-4 flex justify-end space-x-3">
                        <button id="comment-modal-close-btn" class="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors duration-200">Close</button>
                        <button id="comment-modal-save-btn" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200">Save Comment</button>
                        <button id="comment-modal-save-edit-btn" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors duration-200 hidden">Save Edit</button>
                        <button id="comment-modal-cancel-edit-btn" class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200 hidden">Cancel Edit</button>
                    </div>
                </div>
            `;
            document.body.appendChild(commentModalOverlay);

            // Get references to modal elements
            const commentTextarea = document.getElementById('comment-textarea');
            const commentModalCloseBtn = document.getElementById('comment-modal-close-btn');
            const commentModalSaveBtn = document.getElementById('comment-modal-save-btn');
            const commentModalSaveEditBtn = document.getElementById('comment-modal-save-edit-btn');
            const commentModalCancelEditBtn = document.getElementById('comment-modal-cancel-edit-btn');
            const existingCommentsDiv = document.getElementById('existing-comments');
            
            let currentEditingInvoiceId = null; // To keep track of which invoice's comment is being edited
            let editingCommentIndex = null; // New variable to store the index of the comment being edited
            let allInvoicesData = {}; // Store the original fetched data
             
           
            const currentYear = new Date().getFullYear().toString();
            let currentFilters = {
                store: '',
                date: '',
                year: currentYear,
                month: ''
            };

            /**
             * Shows a temporary status message (toast).
             * @param {string} message - The message to display.
             * @param {string} type - 'success', 'error', or 'info' to change background color.
             */
            function showStatusMessage(message, type = 'info') {
                statusMessageDiv.textContent = message;
                statusMessageDiv.classList.remove('bg-green-600', 'bg-red-600', 'bg-gray-800');
                if (type === 'success') {
                    statusMessageDiv.classList.add('bg-green-600');
                } else if (type === 'error') {
                    statusMessageDiv.classList.add('bg-red-600');
                } else {
                    statusMessageDiv.classList.add('bg-gray-800');
                }
                statusMessageDiv.classList.remove('opacity-0', 'pointer-events-none');
                statusMessageDiv.classList.add('opacity-100');

                setTimeout(() => {
                    statusMessageDiv.classList.remove('opacity-100');
                    statusMessageDiv.classList.add('opacity-0', 'pointer-events-none');
                }, 3000);
            }

            /**
             * Fetches JSON data from the specified URL and proactively corrects malformed comments.
             * Implements exponential backoff for retries.
             */
            async function fetchDataWithRetry(url, retries = 5, delay = 1000) {
                for (let i = 0; i < retries; i++) {
                    try {
                        const response = await fetch(url);
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        const data = await response.json();

                        // *** CRITICAL FIX: PROACTIVE DATA CORRECTION ***
                        // Create an array of promises for each correction and wait for all to resolve.
                        const correctionPromises = Object.entries(data).map(async ([invoiceId, invoiceDetails]) => {
                            const comments = invoiceDetails.comment;
                            let needsCorrection = false;
                            let correctedComments = [];

                            // If comments exist, check if they are a valid array
                            if (comments !== undefined && !Array.isArray(comments)) {
                                needsCorrection = true;
                            }
                            
                            // NEW: Also check for old string-based comments and convert them to the new object format
                            if (Array.isArray(comments)) {
                                comments.forEach(comment => {
                                    if (typeof comment === 'string') {
                                        // Assume a generic timestamp for old comments
                                        correctedComments.push({ text: comment, timestamp: '2023-01-01T00:00:00Z' }); 
                                        needsCorrection = true;
                                    } else {
                                        correctedComments.push(comment); // Keep new object-based comments as is
                                    }
                                });
                            }

                            if (needsCorrection) {
                                console.warn(`Correcting malformed comment data for invoice ID: ${invoiceId}. Resetting to an empty array.`);
                                invoiceDetails.comment = correctedComments.length > 0 ? correctedComments : [];
                                await updateInvoiceField(invoiceId, 'comment', invoiceDetails.comment);
                            }
                        });

                        await Promise.all(correctionPromises);

                        return data;

                    } catch (error) {
                        console.error(`Attempt ${i + 1} failed:`, error.message);
                        if (i < retries - 1) {
                            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, 2, i)));
                        } else {
                            console.error('Failed to fetch data after multiple retries. Please check URL and network.');
                        }
                    }
                }
                return null;
            }


           
            async function updateInvoiceField(invoiceId, fieldName, value) {
                const editableFields = ['store', 'date', 'invoiceNumber', 'amount', 'gst'];
                // const editableFields = [];
                // if (window.isAdmin) {
                //     editableFields = ['store', 'date', 'invoiceNumber', 'amount', 'gst'];
                // } else {
                //     editableFields = [ 'date', 'invoiceNumber', 'amount', 'gst'];
                // }



                if (editableFields.includes(fieldName) && !window.isAdmin) {
                    showStatusMessage('Permission denied. Only admins can edit these fields.', 'error');
                    const element = document.querySelector(`[data-invoice-id="${invoiceId}"][data-field="${fieldName}"]`);
                    if (element) {
                        element.value = allInvoicesData[invoiceId][fieldName];
                    }
                    return;
                }

                showStatusMessage('Saving...', 'info');
                const url = `${firebaseBaseUrl}/${invoiceId}.json`;
                try {
                    const payload = {};
                    payload[fieldName] = value;

                    const response = await fetch(url, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to update invoice ${invoiceId} field ${fieldName}: ${response.statusText}`);
                    }

                    showStatusMessage('Saved successfully!', 'success');

                    // Update the corresponding data in allInvoicesData
                    if (allInvoicesData[invoiceId]) {
                        allInvoicesData[invoiceId][fieldName] = value;
                    }

                    // Update the data-current-comment attribute on the icon in the table
                    if (fieldName === 'comment') {
                        const commentIcon = document.querySelector(`span.comment-edit-icon[data-invoice-id="${invoiceId}"]`);
                        if (commentIcon) {
                            const comments = Array.isArray(value) ? value : [];
                            const commentsString = JSON.stringify(comments);
                            // Corrected: Use camelCase for dataset property
                            commentIcon.dataset.currentComment = commentsString;
                            if (comments.length > 0) {
                                commentIcon.classList.remove('text-gray-400', 'hover:text-gray-600');
                                commentIcon.classList.add('text-blue-600', 'hover:text-blue-800');
                            } else {
                                commentIcon.classList.remove('text-blue-600', 'hover:text-blue-800');
                                commentIcon.classList.add('text-gray-400', 'hover:text-gray-600');
                            }
                        }
                    }

                } catch (error) {
                    console.error(`Error updating invoice ${fieldName} status:`, error);
                    showStatusMessage('Error saving change!', 'error');
                    const element = document.querySelector(`[data-invoice-id="${invoiceId}"][data-field="${fieldName}"]`);
                    if (element) {
                        if (element.type === 'checkbox') {
                            element.checked = !value;
                        }
                    }
                }
            }
            
            async function createNewInvoice() {
                if (!window.isAdmin) { 
                    showStatusMessage('Permission denied. Only admins can create new invoices.', 'error');
                    return;
                }

                showStatusMessage('Creating new invoice...', 'info');
                const newInvoiceData = {
                    date: new Date().toISOString().slice(0, 10), 
                    store: '',
                    amount: 0.00,
                    gst: 0.00,
                    paid: false,
                    comment: [],
                    invoiceNumber: 'NEW-' + Date.now() 
                };
                const url = `${firebaseBaseUrl}.json`;
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newInvoiceData),
                    });
                    if (!response.ok) {
                        throw new Error(`Failed to create new invoice: ${response.statusText}`);
                    }
                    const responseData = await response.json();
                    const newInvoiceId = responseData.name;
                    console.log(`New invoice created with ID: ${newInvoiceId}`);
                    showStatusMessage('New invoice created!', 'success');

                    // Fetch all data again to update the table with the new entry
                    const updatedData = await fetchDataWithRetry(url);
                    if (updatedData) {
                        allInvoicesData = updatedData;
                        filterInvoices();
                    }

                } catch (error) {
                    console.error('Error creating new invoice:', error);
                    showStatusMessage('Error creating new invoice!', 'error');
                }
            }



            // Function to delete an invoice
            async function deleteInvoice(invoiceId) {
                if (!window.isAdmin) {
                    console.error('Permission denied: You must be an admin to delete invoices.');
                    return;
                }

                if (confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
                    showStatusMessage('Deleting invoice...', 'info');
                    const url = `${firebaseBaseUrl}/${invoiceId}.json`;
                    try {
                        const response = await fetch(url, {
                            method: 'DELETE'
                        });

                        if (!response.ok) {
                            throw new Error(`Failed to delete invoice: ${response.statusText}`);
                        }

                        console.log('Invoice successfully deleted!');
                        showStatusMessage('Invoice successfully deleted!', 'success');

                        // After deletion, refresh the list of invoices
                        filterInvoices();
                    } catch (error) {
                        console.error('Error removing invoice: ', error);
                        showStatusMessage('Error deleting invoice!', 'error');
                    }
                }
            }


            /**
             * Refreshes the comments displayed in the modal for the current invoice.
             * @param {string} invoiceId - The ID of the invoice to display comments for.
             */
            function refreshCommentsInModal(invoiceId) {
                const invoiceData = allInvoicesData[invoiceId];
                const comments = invoiceData && invoiceData.comment && Array.isArray(invoiceData.comment) ? invoiceData.comment : [];
                existingCommentsDiv.innerHTML = ''; // Clear existing comments

                if (comments.length === 0) {
                    existingCommentsDiv.innerHTML = '<p class="text-gray-500">No comments yet.</p>';
                } else {
                    comments.forEach((comment, index) => {
                        const commentText = typeof comment === 'string' ? comment : comment.text;
                        const commentDate = typeof comment === 'string' ? 'N/A' : new Date(comment.timestamp).toLocaleString();
                        const commentElement = document.createElement('div');
                        commentElement.className = 'comment-item bg-white p-3 rounded-md shadow mb-2 flex justify-between items-center';
                        commentElement.innerHTML = `
                            <div class="flex-grow">
                                <p class="text-sm text-gray-800">${commentText}</p>
                                <p class="text-xs text-gray-500 mt-1">${commentDate}</p>
                            </div>
                            <div class="flex space-x-2 ml-4">
                                <button class="edit-comment-btn text-blue-500 hover:text-blue-700" data-index="${index}">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                    </svg>
                                    <span class="sr-only">Edit</span>
                                </button>
                                <button class="delete-comment-btn text-red-500 hover:text-red-700" data-index="${index}">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                                    </svg>
                                    <span class="sr-only">Delete</span>
                                </button>
                            </div>
                        `;
                        existingCommentsDiv.appendChild(commentElement);
                    });

                    // Add event listeners for edit and delete buttons on existing comments
                    existingCommentsDiv.querySelectorAll('.edit-comment-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            editingCommentIndex = parseInt(e.currentTarget.dataset.index, 10);
                            const commentToEdit = comments[editingCommentIndex];
                            const commentText = typeof commentToEdit === 'string' ? commentToEdit : commentToEdit.text;
                            commentTextarea.value = commentText;
                            commentModalSaveBtn.classList.add('hidden');
                            commentModalSaveEditBtn.classList.remove('hidden');
                            commentModalCancelEditBtn.classList.remove('hidden');
                        });
                    });

                    existingCommentsDiv.querySelectorAll('.delete-comment-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const commentIndexToDelete = parseInt(e.currentTarget.dataset.index, 10);
                            const newComments = comments.filter((_, i) => i !== commentIndexToDelete);
                            await updateInvoiceField(currentEditingInvoiceId, 'comment', newComments);
                            refreshCommentsInModal(currentEditingInvoiceId); 
                        });
                    });
                }
            }

           
            async function filterInvoices() {

                const invoices = await fetchDataWithRetry( firebaseBaseUrl + '.json' );
                if (invoices) {
                     allInvoicesData = invoices; // Update the global data store

                        const { store: currentStoreFilter, date: currentDateFilter, year: currentYearFilter, month: currentMonthFilter } = currentFilters;

                        const filteredData = {};
                        Object.entries(allInvoicesData).forEach(([invoiceId, invoiceDetails]) => {
                            let matches = true;
                            const invoiceDate = invoiceDetails.date;

                            // Filter by Store
                            if (currentStoreFilter && invoiceDetails.store.toLowerCase() !== currentStoreFilter) {
                                matches = false;
                            }

                            // Filter by exact Date
                            if (matches && currentDateFilter && invoiceDate !== currentDateFilter) {
                                matches = false;
                                console.log('entre al filtro de aﾃｱo', invoiceDate, currentYearFilter);
                            }

                            // Filter by Year
                            if (matches && currentYearFilter && invoiceDate && new Date(invoiceDate).getFullYear().toString() !== currentYearFilter) {
                                matches = false;
                            }

                            // Filter by Month
                            if (matches && currentMonthFilter && invoiceDate) {
                                if ((new Date(invoiceDate).getMonth() + 1).toString() !== currentMonthFilter) {
                                    matches = false;
                                }
                            }
                            //  // Filter by Paid Status
                            // if (matches && currentFilters.paid !== undefined) {
                            //     if (invoiceDetails.paid !== currentFilters.paid) {
                            //         matches = false;
                            //     }
                            // }

                            if (matches) {
                                filteredData[invoiceId] = invoiceDetails;
                            }
                        });

                        // // REPLACE THE OLD SORTING CODE BELOW WITH THE NEW CODE ⭐
                        // const sortedInvoices = Object.entries(filteredData).sort(([idA, invoiceA], [idB, invoiceB]) => {
                        // // 1. Sort by paid status (unpaid first)
                        // if (invoiceA.paid === false && invoiceB.paid === true) {
                        //     return -1;
                        // }
                        // if (invoiceA.paid === true && invoiceB.paid === false) {
                        //     return 1;
                        // }
                                    
                        //     // 2. If paid status is the same, sort by date ascending
                        //     const dateA = new Date(invoiceA.date);
                        //     const dateB = new Date(invoiceB.date);
                        //     return dateA - dateB;
                        // });


                        // Pass the global filter values to renderInvoiceTable
                        renderInvoiceTable(filteredData, currentFilters);
                        //  renderInvoiceTable(Object.fromEntries(sortedInvoices), currentFilters);

                        

                    }else {
                        showStatusMessage('Could not fetch invoices.', 'error');
                    }
            }

      

            
            function clearFilters() {
                currentFilters = {
                    store: '',
                    date: '',
                    year: '',
                    month: ''
                };
                filterInvoices();                                        
            }

            /**
             * Populates the year and month filter dropdowns.
             * @param {string} selectedYear - The year to pre-select.
             * @param {string} selectedMonth - The month to pre-select.
             */
            function populateDateFilters(selectedYear = '', selectedMonth = '') {
                const years = new Set();
                const months = [
                    { value: '', text: 'All Months' },
                    { value: '1', text: 'January' }, { value: '2', text: 'February' },
                    { value: '3', text: 'March' }, { value: '4', text: 'April' },
                    { value: '5', text: 'May' }, { value: '6', text: 'June' },
                    { value: '7', text: 'July' }, { value: '8', text: 'August' },
                    { value: '9', text: 'September' }, { value: '10', text: 'October' },
                    { value: '11', text: 'November' }, { value: '12', text: 'December' }
                ];

                Object.values(allInvoicesData).forEach(invoiceDetails => {
                    if (invoiceDetails.date) {
                        const year = new Date(invoiceDetails.date).getFullYear();
                        if (!isNaN(year)) {
                            years.add(year.toString());
                        }
                    }
                });

                const yearSelect = document.getElementById('filter-year');
                if (yearSelect) {
                    yearSelect.innerHTML = '<option value="">All Years</option>';
                    Array.from(years).sort((a, b) => parseInt(b) - parseInt(a)).forEach(year => {
                        const option = document.createElement('option');
                        option.value = year;
                        option.textContent = year;
                        if (year === selectedYear) { // Set selected year
                            option.selected = true;
                        }
                        yearSelect.appendChild(option);
                    });
                }

                const monthSelect = document.getElementById('filter-month');
                if (monthSelect) {
                    monthSelect.innerHTML = ''; // Clear existing options
                    months.forEach(month => {
                        const option = document.createElement('option');
                        option.value = month.value;
                        option.textContent = month.text;
                        if (month.value === selectedMonth) { // Set selected month
                            option.selected = true;
                        }
                        monthSelect.appendChild(option);
                    });
                }
            }

           
            function populateStoreFilter(selectedStore = '') {
                const stores = new Set();
                Object.values(allInvoicesData).forEach(invoiceDetails => {
                    if (invoiceDetails.store) {
                        stores.add(invoiceDetails.store);
                    }
                });

                const storeSelect = document.getElementById('filter-store');
                if (storeSelect) {
                    storeSelect.innerHTML = '<option value="">All Stores</option>'; // Default option
                    Array.from(stores).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).forEach(store => {
                        const option = document.createElement('option');
                        option.value = store.toLowerCase(); // Store lowercase for consistent filtering
                        option.textContent = store; // Display original case
                        if (store.toLowerCase() === selectedStore) { // Set selected store
                            option.selected = true;
                        }
                        storeSelect.appendChild(option);
                    });
                }
            }


            // Function to render the table
            function renderInvoiceTable(dataToRender, currentFilters) {
                // Group data by store and calculate sums
                const groupedData = {};
                Object.entries(dataToRender).forEach(([invoiceId, invoiceDetails]) => {
                    const store = invoiceDetails.store || 'Uncategorized';
                    if (!groupedData[store]) {
                        groupedData[store] = {
                            invoices: [],
                            totalAmount: 0,
                            totalGst: 0
                        };
                    }
                    groupedData[store].invoices.push({ id: invoiceId, ...invoiceDetails });
                    groupedData[store].totalAmount += parseFloat(invoiceDetails.amount || 0);
                    groupedData[store].totalGst += parseFloat(invoiceDetails.gst || 0);
                });

                // Sort the invoices within each store group by date in descending order
                Object.keys(groupedData).forEach(storeName => {
                    groupedData[storeName].invoices.sort((a, b) => {
                        const dateA = a.date ? new Date(a.date) : 0;
                        const dateB = b.date ? new Date(b.date) : 0;
                        return dateB - dateA; // Sort descending
                    });
                });

                const allKeys = new Set();
                Object.values(dataToRender).forEach(invoiceDetails => {
                    Object.keys(invoiceDetails).forEach(key => allKeys.add(key));
                });
                allKeys.add('id');

                // Define a desired order for specific keys
                let desiredOrderForColumns = [ 'date', 'invoiceNumber','amount', 'gst', 'paid','comment'];
               let headers = [];

                const internalInvoiceIdKeysToExclude = ['id','store'];

                desiredOrderForColumns.forEach(key => {
                    
                    if (allKeys.has(key) && !internalInvoiceIdKeysToExclude.includes(key)) {
                        headers.push(key);
                    }
                    allKeys.delete(key);
                });

                Array.from(allKeys)
                    .filter(key => !internalInvoiceIdKeysToExclude.includes(key))
                    .sort()
                    .forEach(key => headers.push(key));

                // Check if the user is an admin and add the 'Delete' header
                if (window.isAdmin) {
                    headers.push('delete');
                    headers.push('store');
                }

                let tableHtml = '';
                tableHtml += `
                    <div class="overflow-x-auto">
                         <table class="min-w-full divide-y divide-gray-200" id="invoices-table">
                            <thead class="bg-gray-200">
                                <tr>
                                    ${headers.map(header => `
                                        <th class="py-3 px-4 border border-gray-300 text-center text-sm font-semibold text-gray-700 ${header === 'comment' ? 'comment-header' : ''}">
                                        
                                        ${ 
                                            header === 'store' ? '' : 
                                            header === 'comment' ? '' : 
                                            header === 'delete' ? '' : 
                                            header === 'invoiceNumber' ? 'Invoice' : 
                                                header.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                                        }
                                        </th>
                                    `).join('')}
                                </tr>
                            </thead>
                            <tbody>
                `;
                
            //  ${headers.map(header => `
            //                             <th class="py-3 px-4 border border-gray-300 text-center text-sm font-semibold text-gray-700 ${header === 'comment' ? 'comment-header' : ''}">
            //                                 ${header === 'invoiceNumber' ? 'Invoice' : header.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
            //                             </th>
            //                         `).join('')}
                
                Object.keys(groupedData).sort().forEach(storeName => {
                    const storeGroup = groupedData[storeName];
                    const amountIndex = headers.indexOf('amount');
                    const gstIndex = headers.indexOf('gst');

                    let totalRowCells = '';
                    let currentColumn = 0;
                    const firstTotalColumnIndex = headers.indexOf('amount');

                    // Handle the total row cell
                    const totalCellColspan = (firstTotalColumnIndex !== -1 ? firstTotalColumnIndex : headers.length);
                    totalRowCells += `<td class="py-3 px-4 border-2 border-blue-500 text-left text-base font-bold text-blue-800" colspan="${totalCellColspan}">${storeName}</td>`;
                    currentColumn = totalCellColspan;

                    for (let i = currentColumn; i < headers.length; i++) {
                        if (headers[i] === 'amount' && amountIndex !== -1) {
                            totalRowCells += `<td class="py-3 px-4 border-2 border-blue-500 text-center text-sm font-extrabold text-blue-800">${storeGroup.totalAmount.toFixed(2)}</td>`;
                        } else if (headers[i] === 'gst' && gstIndex !== -1) {
                            totalRowCells += `<td class="py-3 px-4 border-2 border-blue-500 text-center text-sm font-extrabold text-blue-800">${storeGroup.totalGst.toFixed(2)}</td>`;
                        } else {
                            totalRowCells += `<td class="py-3 px-4 border border-gray-300"></td>`;
                        }
                    }

                    tableHtml += `
                        <tr class="bg-blue-100">
                            ${totalRowCells}
                        </tr>
                    `;

                    storeGroup.invoices.forEach(invoice => {
                        tableHtml += `
                                    <tr class="hover:bg-gray-100 transition-colors duration-200">
                        `;
                        headers.forEach(headerKey => {
                            let cellContent;
                            if (headerKey === 'paid') {
                                const isPaid = invoice[headerKey] === true || invoice[headerKey] === 'true';
                                cellContent = `
                                    <input type="checkbox"
                                        class="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500 focus:border-blue-500"
                                        data-invoice-id="${invoice.id}"
                                        data-field="paid"
                                        ${isPaid ? 'checked' : ''}>
                                `;
                            } else if (headerKey === 'comment') {
                                const comments = invoice[headerKey] !== undefined && Array.isArray(invoice[headerKey]) ? invoice[headerKey] : [];
                                const commentsString = JSON.stringify(comments);
                                const iconColorClass = comments.length > 0 ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 hover:text-gray-600';
                                cellContent = `
                                    <span class="comment-edit-icon ${iconColorClass} cursor-pointer transition-colors duration-200"
                                        data-invoice-id="${invoice.id}"
                                        data-current-comment='${commentsString}'>
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline-block align-middle" viewBox="0 0 20 20" fill="currentColor">
                                            <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.336-3.118A7.944 7.944 0 012 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9H7v2h2V9z" clip-rule="evenodd" />
                                        </svg>
                                        <span class="sr-only">Edit Comment</span>
                                    </span>
                                `;
                            } else if (headerKey === 'invoiceNumber') {
                                const invoiceNumber = invoice[headerKey] !== undefined ? invoice[headerKey] : 'N/A';
                                const pdfFileName = `${invoiceNumber}.pdf`;
                                // Fix: Separate the link from the input field
                                cellContent = `
                                    <div class="relative flex items-center justify-center">
                                        <a href="pdfs/${pdfFileName}" target="_blank" class="text-blue-600 hover:text-blue-800 transition-colors duration-200 ${window.isAdmin ? 'hidden' : ''}">
                                            <span>${invoiceNumber}</span>
                                        </a>
                                        <input type="text" value="${invoiceNumber}"
                                            data-invoice-id="${invoice.id}"
                                            data-field="invoiceNumber"
                                            class="editable-input w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 text-center ${window.isAdmin ? '' : 'hidden'}">
                                    </div>
                                `;
                                
                            }
                            else if (headerKey === 'date') {
                                const value = invoice[headerKey] !== undefined ? invoice[headerKey] : 'N/A';
                                cellContent = `
                                    <input type="date" value="${value}"
                                        data-invoice-id="${invoice.id}"
                                        data-field="date"
                                        class="editable-input w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 text-center">
                                `;
                            }
                            else if (headerKey === 'amount') {
                                const value = invoice[headerKey] !== undefined ? invoice[headerKey] : '0.00';
                                cellContent = `
                                    <input type="number" step="0.01" value="${value}"
                                        data-invoice-id="${invoice.id}"
                                        data-field="amount"
                                        class="editable-input w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 text-center">
                                `;
                            }
                            else if (headerKey === 'gst') {
                                const value = invoice[headerKey] !== undefined ? invoice[headerKey] : '0.00';
                                cellContent = `
                                    <input type="number" step="0.01" value="${value}"
                                        data-invoice-id="${invoice.id}"
                                        data-field="gst"
                                        class="editable-input w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 text-center">
                                `;
                            }
                            else if (headerKey === 'id') {
                                cellContent = invoice.id;
                            } 
                            else if (headerKey === 'store') {
                                const value = invoice[headerKey] !== undefined ? invoice[headerKey] : 'New Store';
                                cellContent = `
                                    <input type="text" value="${value}"
                                        data-invoice-id="${invoice.id}"
                                        data-field="store"
                                        class="editable-input w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 text-center">
                                `;
                            } else if (headerKey === 'delete') {
                                const comments = invoice[headerKey] !== undefined && Array.isArray(invoice[headerKey]) ? invoice[headerKey] : [];
                                const commentsString = JSON.stringify(comments);
                                const iconColorClass = comments.length > 0 ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 hover:text-gray-600';
                                cellContent = `
                                    <span class="invoice-delete-icon text-red-500 hover:text-red-700"
                                        data-invoice-id="${invoice.id}">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                               <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                                        </svg>
                                       
                                    </span>
                                `;


                            } else {
                                
                                const value = invoice[headerKey] !== undefined ? invoice[headerKey] : 'N/A';
                                cellContent = value;
                            }
                            tableHtml += `
                                        <td class="py-3 px-4 border border-gray-200 text-sm text-gray-700 text-center">${cellContent}</td>
                            `;
                        });
                        tableHtml += `
                                    </tr>
                        `;
                    });
                });

                tableHtml += `
                            </tbody>
                        </table>
                    </div>
                `;

                dataContainer.innerHTML = `
                    <div class="mb-6 px-2 py-4 bg-white rounded-lg shadow-md grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label for="filter-store" class="block text-sm font-medium text-gray-700">Filter by Store:</label>
                            <select id="filter-store" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                                <option value="">All Stores</option>
                            </select>
                        </div>
                        <div>
                            <label for="filter-date" class="block text-sm font-medium text-gray-700">Filter by Date:</label>
                            <input type="date" id="filter-date" value="${currentFilters.date}" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                        </div>
                        <div>
                            <label for="filter-year" class="block text-sm font-medium text-gray-700">Filter by Year:</label>
                            <select id="filter-year" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                                <option value="">All Years</option>
                            </select>
                        </div>
                        <div>
                            <label for="filter-month" class="block text-sm font-medium text-gray-700">Filter by Month:</label>
                            <select id="filter-month" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                                <option value="">All Months</option>
                            </select>
                        </div>
                        
                        <div class="md:col-span-2 lg:col-span-4 flex justify-end gap-2">
                          
                            ${window.isAdmin ? `<button id="create-invoice-btn" class="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50">
                                Create New Invoice
                            </button>` : ''}
                            <button id="clear-filters-btn" class="px-5 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50">
                                Clear Filters
                            </button>
                        </div>
                    </div>
                    ${tableHtml}
                `;
                
                // Re-attach event listeners after re-rendering the table
                document.querySelectorAll('input[type="checkbox"][data-invoice-id]').forEach(checkbox => {
                    checkbox.addEventListener('change', (event) => {
                        const invoiceId = event.target.dataset.invoiceId;
                        const newPaidStatus = event.target.checked;
                        updateInvoiceField(invoiceId, 'paid', newPaidStatus);
                    });
                });

                document.querySelectorAll('span.comment-edit-icon').forEach(icon => {
                    icon.addEventListener('click', async (event) => {
                        currentEditingInvoiceId = event.currentTarget.dataset.invoiceId;
                        refreshCommentsInModal(currentEditingInvoiceId);
                        commentTextarea.value = '';
                        commentModalSaveBtn.classList.remove('hidden');
                        commentModalSaveEditBtn.classList.add('hidden');
                        commentModalCancelEditBtn.classList.add('hidden');
                        editingCommentIndex = null;
                        commentModalOverlay.classList.remove('hidden');
                    });
                });

                 document.querySelectorAll('span.invoice-delete-icon').forEach(icon => {
                    icon.addEventListener('click', async (event) => {
                    const  currentInvoiceId = event.currentTarget.dataset.invoiceId;
                    deleteInvoice(currentInvoiceId);
                    // filterInvoices(); // Refresh the table after deletion    
                        
                        // refreshCommentsInModal(currentEditingInvoiceId);
                        // commentTextarea.value = '';
                        // commentModalSaveBtn.classList.remove('hidden');
                        // commentModalSaveEditBtn.classList.add('hidden');
                        // commentModalCancelEditBtn.classList.add('hidden');
                        // editingCommentIndex = null;
                        // commentModalOverlay.classList.remove('hidden');
                    });
                });

                document.querySelectorAll('.editable-input').forEach(input => {
                    // NEW: Disable inputs if not in admin mode
                    if (!window.isAdmin) {
                        input.setAttribute('disabled', 'disabled');
                    } else {
                        input.removeAttribute('disabled');
                    }
                    
                    input.addEventListener('change', (event) => {
                        const invoiceId = event.target.dataset.invoiceId;
                        const fieldName = event.target.dataset.field;
                        let newValue = event.target.value;

                        if (fieldName === 'amount' || fieldName === 'gst') {
                            newValue = parseFloat(newValue);
                            if (isNaN(newValue)) {
                                console.error('Invalid number entered for amount or gst.');
                                showStatusMessage('Invalid number entered!', 'error');
                                return;
                            }
                        }
                        
                        updateInvoiceField(invoiceId, fieldName, newValue);
                    });
                });
                
                // Add event listeners for filters
                // --- NEW: Update the global currentFilters object on change and then filter ---
                const filterStore = document.getElementById('filter-store');
                if (filterStore) {
                    filterStore.addEventListener('change', (event) => {
                        currentFilters.store = event.target.value.toLowerCase();
                        filterInvoices();
                    });
                }

                const filterDate = document.getElementById('filter-date');
                if (filterDate) {
                    filterDate.addEventListener('change', (event) => {
                        currentFilters.date = event.target.value;
                        filterInvoices();
                    });
                }
                
                const filterYear = document.getElementById('filter-year');
                if (filterYear) {
                    filterYear.addEventListener('change', (event) => {
                        currentFilters.year = event.target.value;
                        filterInvoices();
                    });
                }
                
                const filterMonth = document.getElementById('filter-month');
                if (filterMonth) {
                    filterMonth.addEventListener('change', (event) => {
                        currentFilters.month = event.target.value;
                        filterInvoices();
                    });
                }
                
                const clearFiltersBtn = document.getElementById('clear-filters-btn');
                if (clearFiltersBtn) {
                    clearFiltersBtn.addEventListener('click', clearFilters);
                }
                
                if(window.isAdmin) { 
                    const createInvoiceBtn = document.getElementById('create-invoice-btn');
                    if(createInvoiceBtn) {
                        createInvoiceBtn.addEventListener('click', createNewInvoice); 
                    }
                }

               
            

                // Populate filters with current selections
                populateStoreFilter(currentFilters.store);
                populateDateFilters(currentFilters.year, currentFilters.month);
            }
            
            // NEW: Add a change listener to the admin toggle
            // The `adminToggle` variable is already declared above, so we don't need to redeclare it.
            if (adminToggle) {
                adminToggle.addEventListener('change', () => {
                    window.isAdmin = adminToggle.checked;
                    filterInvoices(); // Re-render the table with the new admin state
                });
            }


            // Modal Event Listeners
            commentModalCloseBtn.addEventListener('click', () => {
                commentModalOverlay.classList.add('hidden');
            });

            commentModalSaveBtn.addEventListener('click', async () => {
                const newComment = commentTextarea.value.trim();
                if (newComment) {
                    const invoiceData = allInvoicesData[currentEditingInvoiceId];
                    const currentComments = invoiceData.comment && Array.isArray(invoiceData.comment) ? invoiceData.comment : [];
                    // NEW: Store comment as an object with text and timestamp
                    const updatedComments = [...currentComments, { text: newComment, timestamp: new Date().toISOString() }];
                    await updateInvoiceField(currentEditingInvoiceId, 'comment', updatedComments);
                    commentTextarea.value = ''; // Clear the textarea
                    refreshCommentsInModal(currentEditingInvoiceId); // Refresh the comments list
                }
            });

            commentModalSaveEditBtn.addEventListener('click', async () => {
                const updatedCommentText = commentTextarea.value.trim();
                if (updatedCommentText && editingCommentIndex !== null) {
                    const invoiceData = allInvoicesData[currentEditingInvoiceId];
                    const currentComments = invoiceData.comment && Array.isArray(invoiceData.comment) ? invoiceData.comment : [];
                    const updatedComments = [...currentComments];
                    // NEW: Update only the text of the comment object, preserve the original timestamp
                    if (updatedComments[editingCommentIndex]) {
                        updatedComments[editingCommentIndex].text = updatedCommentText;
                    }
                    await updateInvoiceField(currentEditingInvoiceId, 'comment', updatedComments);
                    commentTextarea.value = '';
                    commentModalSaveBtn.classList.remove('hidden');
                    commentModalSaveEditBtn.classList.add('hidden');
                    commentModalCancelEditBtn.classList.add('hidden');
                    editingCommentIndex = null;
                    refreshCommentsInModal(currentEditingInvoiceId);
                }
            });

            commentModalCancelEditBtn.addEventListener('click', () => {
                commentTextarea.value = '';
                commentModalSaveBtn.classList.remove('hidden');
                commentModalSaveEditBtn.classList.add('hidden');
                commentModalCancelEditBtn.classList.add('hidden');
                editingCommentIndex = null;
            });
            
            // Initial fetch and table render
            (async () => {
                const data = await fetchDataWithRetry(`${firebaseBaseUrl}.json`);
                if (data && Object.keys(data).length > 0) {
                    allInvoicesData = data;
                    filterInvoices(); // Render initial table with filters
                } else if (data && Object.keys(data).length === 0) {
                    dataContainer.innerHTML = `<p class="text-gray-600 text-center text-lg">No invoice data found in the database.</p>`;
                } else {
                    dataContainer.innerHTML = `<p class="error-message text-center">Failed to load invoice data. Please verify the Firebase URL and your internet connection.</p>`;
                }
            })();

            
        } else {
            // User is not signed in, redirect to login page
            window.location.href = 'login.html';
        }
    });

    // --- Logout button event listener ---
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await auth.signOut();
                window.location.href = 'login.html';
            } catch (error) {
                console.error('Logout error:', error);
            }
        });
    }

    // NEW: The following line is the duplicate declaration that causes the error.
    const adminToggle = document.getElementById('admin-toggle');
    // We already declared and used it earlier in the script. The event listener below
    // will work with the existing variable.

    
    // if (adminToggle) {
    //     adminToggle.addEventListener('change', () => {
    //         window.isAdmin = adminToggle.checked;
    //         filterInvoices(); // Re-render the table with the new admin state
    //     });
    // }


});