document.addEventListener('DOMContentLoaded', () => {
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

    // --- NEW: Global state object for filters ---
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

                    // If comments exist, check if they are a valid array
                    if (comments !== undefined && !Array.isArray(comments)) {
                        needsCorrection = true;
                    }

                    if (needsCorrection) {
                        console.warn(`Correcting malformed comment data for invoice ID: ${invoiceId}. Resetting to an empty array.`);
                        invoiceDetails.comment = []; // Correct the local data
                        await updateInvoiceField(invoiceId, 'comment', []); // Permanently fix it in Firebase
                    }
                });

                await Promise.all(correctionPromises); // Wait for all corrections to be saved to Firebase

                return data;

            } catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error.message);
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
                } else {
                    console.error('Failed to fetch data after multiple retries. Please check URL and network.');
                }
            }
        }
        return null;
    }


    /**
     * Updates a specific field for an invoice in Firebase.
     * @param {string} invoiceId - The ID of the invoice to update.
     * @param {string} fieldName - The name of the field to update (e.g., 'paid', 'comment').
     * @param {*} value - The new value for the field.
     */
    async function updateInvoiceField(invoiceId, fieldName, value) {
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

            console.log(`Invoice ${invoiceId} ${fieldName} updated.`);
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

    /**
     * Filters the invoices based on the current filter criteria.
     */
    function filterInvoices() {
        // --- NEW: Use the global currentFilters object instead of reading from the DOM ---
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
            }

            // Filter by Year
            if (matches && currentYearFilter && invoiceDate && new Date(invoiceDate).getFullYear().toString() !== currentYearFilter) {
                matches = false;
                console.log('entre al filtro de año', invoiceDate, currentYearFilter);
            }

            // Filter by Month
            if (matches && currentMonthFilter && invoiceDate) {
                if ((new Date(invoiceDate).getMonth() + 1).toString() !== currentMonthFilter) {
                    matches = false;
                }
            }

            if (matches) {
                filteredData[invoiceId] = invoiceDetails;
            }
        });
        // Pass the global filter values to renderInvoiceTable
        renderInvoiceTable(filteredData, currentFilters);
    }

    /**
     * Clears all filter selections and displays all invoices.
     */
    function clearFilters() {
        // --- NEW: Reset the global currentFilters object ---
        currentFilters = {
            store: '',
            date: '',
            year: '',
            month: ''
        };
        filterInvoices(); // Re-filter to display all data
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

        const monthSelect = document.getElementById('filter-month');
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

    /**
     * Populates the store filter dropdown.
     * @param {string} selectedStore - The store to pre-select.
     */
    function populateStoreFilter(selectedStore = '') {
        const stores = new Set();
        Object.values(allInvoicesData).forEach(invoiceDetails => {
            if (invoiceDetails.store) {
                stores.add(invoiceDetails.store);
            }
        });

        const storeSelect = document.getElementById('filter-store');
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

        // Define a desired order for specific keys, with 'id' as the first column
        const desiredOrderForColumns = ['date', 'invoiceNumber','amount', 'gst', 'paid','comment'];
        let headers = [];

        // Also exclude 'store' from general columns to ensure it's not added as a regular column
        const internalInvoiceIdKeysToExclude = ['store','id'];

        desiredOrderForColumns.forEach(key => {
            
            if (allKeys.has(key) && !internalInvoiceIdKeysToExclude.includes(key)) {
                headers.push(key);
            }
            allKeys.delete(key);
        });

        Array.from(allKeys)
            .filter(key => !internalInvoiceIdKeysToExclude.includes(key)) // Ensure 'store' is filtered out here too
            .sort()
            .forEach(key => headers.push(key));

        let tableHtml = '';
        tableHtml += `
            <div class="overflow-x-auto">
                <table class="min-w-full bg-white border border-gray-300 rounded-lg shadow-md">
                    <thead class="bg-gray-200">
                        <tr>
                            ${headers.map(header => `
                                <th class="py-3 px-4 border border-gray-300 text-center text-sm font-semibold text-gray-700">
                                    ${header.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;
        
       
        
        Object.keys(groupedData).sort().forEach(storeName => {
            const storeGroup = groupedData[storeName];
            const amountIndex = headers.indexOf('amount');
            const gstIndex = headers.indexOf('gst');

            let totalRowCells = '';
            let currentColumn = 0;

            const firstTotalColumnIndex = Math.min(
                amountIndex !== -1 ? amountIndex : headers.length,
                gstIndex !== -1 ? gstIndex : headers.length
            );

            if (firstTotalColumnIndex > 0) {
                totalRowCells += `<td class="py-3 px-4 border border-gray-300 text-left text-base font-bold text-blue-800" colspan="${firstTotalColumnIndex}">${storeName}</td>`;
                currentColumn += firstTotalColumnIndex;
            } else {
                totalRowCells += `<td class="py-3 px-4 border border-gray-300 text-left text-base font-bold text-blue-800">${storeName}</td>`;
                currentColumn++;
            }


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

                console.log('invoice', invoice);

                tableHtml += `
                            <tr class="hover:bg-gray-100 transition-colors duration-200">
                `;
                headers.forEach(headerKey => {
                    let cellContent;
                    if (headerKey === 'paid') {
                        const isPaid = invoice[headerKey] === true || invoice[headerKey] === 'true';
                        cellContent = `
                            <input type="checkbox"
                                   class="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                                   data-invoice-id="${invoice.id}"
                                   data-field="paid"
                                   ${isPaid ? 'checked' : ''}>
                        `;
                    } else if (headerKey === 'comment') {
                        const comments = invoice[headerKey] !== undefined && Array.isArray(invoice[headerKey]) ? invoice[headerKey] : [];
                        const commentsString = JSON.stringify(comments);

                        const iconColorClass = comments.length > 0 ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 hover:text-gray-600';
                        cellContent = `
                            <span class="comment-edit-icon cursor-pointer ${iconColorClass} transition-colors duration-200"
                                  data-invoice-id="${invoice.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline-block align-middle" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.336-3.118A7.944 7.944 0 012 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9H7v2h2V9z" clip-rule="evenodd" />
                                </svg>
                                <span class="sr-only">Edit Comment</span>
                            </span>
                        `;
                    } else if (headerKey === 'invoiceNumber') {
                        const invoiceNumber = invoice[headerKey] !== undefined ? invoice[headerKey] : 'N/A';
                        const pdfFileName = `${invoiceNumber}.pdf`;
                        cellContent = `
                            <a href="pdfs/${pdfFileName}" target="_blank" class="text-blue-600 hover:text-blue-800 transition-colors duration-200">
                                ${invoiceNumber}
                            </a>
                        `;
                    }
                    else if (headerKey === 'amount' || headerKey === 'gst') {
                        const value = invoice[headerKey] !== undefined ? invoice[headerKey] : 'N/A';
                        cellContent = `${value}`;
                    }
                    else if (headerKey === 'id') {
                        cellContent = invoice.id;
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
            <div class="mb-6 p-4 bg-white rounded-lg shadow-md grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <div class="md:col-span-2 lg:col-span-4 flex justify-end">
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
                // Ensure a user is not in editing mode when opening the modal
                commentModalSaveBtn.classList.remove('hidden');
                commentModalSaveEditBtn.classList.add('hidden');
                commentModalCancelEditBtn.classList.add('hidden');
                editingCommentIndex = null;
                commentModalOverlay.classList.remove('hidden');
            });
        });

        // Add event listeners for filters
        // --- NEW: Update the global filters object on change and then filter ---
        document.getElementById('filter-store').addEventListener('change', (event) => {
            currentFilters.store = event.target.value.toLowerCase();
            filterInvoices();
        });
        document.getElementById('filter-date').addEventListener('change', (event) => {
            currentFilters.date = event.target.value;
            filterInvoices();
        });
        document.getElementById('filter-year').addEventListener('change', (event) => {
            currentFilters.year = event.target.value;
            filterInvoices();
        });
        document.getElementById('filter-month').addEventListener('change', (event) => {
            currentFilters.month = event.target.value;
            filterInvoices();
        });
        // --- END NEW ---
        
        document.getElementById('clear-filters-btn').addEventListener('click', clearFilters); // Event listener for clear button

        // Populate filters with current selections
        populateStoreFilter(currentFilters.store);
        populateDateFilters(currentFilters.year, currentFilters.month);
    }
    
    // --- NEW FUNCTION: Refreshes the comment list inside the modal ---
    function refreshCommentsInModal(invoiceId) {
        const invoiceData = allInvoicesData[invoiceId];
        const comments = invoiceData && Array.isArray(invoiceData.comment) ? invoiceData.comment : [];
        const sortedComments = comments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        existingCommentsDiv.innerHTML = sortedComments.length > 0 ?
            sortedComments.map((c, index) => `
                <div class="border-b border-gray-200 last:border-b-0 py-2 flex justify-between items-start">
                    <div>
                        <p class="text-xs text-gray-500">${new Date(c.timestamp).toLocaleString()}</p>
                        <p>${c.text}</p>
                    </div>
                    <div class="flex space-x-2 mt-1">
                        <button class="edit-comment-btn text-blue-500 hover:text-blue-700 text-xs px-2 py-1 rounded transition-colors duration-200" data-comment-index="${index}">Edit</button>
                        <button class="delete-comment-btn text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded transition-colors duration-200" data-comment-index="${index}">Delete</button>
                    </div>
                </div>
            `).join('') :
            '<p class="text-gray-500">No comments yet.</p>';
    }
    // --- END NEW FUNCTION ---

    // --- NEW FUNCTION: Handles all comment updates and refreshes the UI without closing the modal ---
    async function handleCommentUpdate(invoiceId, updatedComments) {
        await updateInvoiceField(invoiceId, 'comment', updatedComments);
        // After successfully updating the field, just refresh the comment list inside the modal and the main table
        refreshCommentsInModal(invoiceId);
        filterInvoices();
    }
    // --- END NEW FUNCTION ---


    existingCommentsDiv.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-comment-btn')) {
            const commentIndex = parseInt(event.target.dataset.commentIndex, 10);
            if (currentEditingInvoiceId !== null && !isNaN(commentIndex)) {
                // Get the current comments and remove the one at the specified index
                const currentComments = [...(allInvoicesData[currentEditingInvoiceId]?.comment || [])];
                if (currentComments.length > commentIndex) {
                    if (confirm('Are you sure you want to delete this comment?')) { // Confirmation dialog
                        currentComments.splice(commentIndex, 1);
                        // Call the new centralized function
                        handleCommentUpdate(currentEditingInvoiceId, currentComments);
                    }
                }
            }
        }
        if (event.target.classList.contains('edit-comment-btn')) {
            const commentIndex = parseInt(event.target.dataset.commentIndex, 10);
            if (currentEditingInvoiceId !== null && !isNaN(commentIndex)) {
                const currentComments = allInvoicesData[currentEditingInvoiceId]?.comment || [];
                const commentToEdit = currentComments[commentIndex];
                if (commentToEdit) {
                    commentTextarea.value = commentToEdit.text;
                    editingCommentIndex = commentIndex;

                    // Toggle button visibility for editing mode
                    commentModalSaveBtn.classList.add('hidden');
                    commentModalSaveEditBtn.classList.remove('hidden');
                    commentModalCancelEditBtn.classList.remove('hidden');
                }
            }
        }
    });

    // Event listeners for the comment modal
    commentModalCloseBtn.addEventListener('click', () => {
        commentModalOverlay.classList.add('hidden');
    });

    /**
     * @description This is the core logic for saving a new comment.
     * It's triggered when the "Save Comment" button is clicked.
     */
    commentModalSaveBtn.addEventListener('click', () => {
        if (currentEditingInvoiceId) {
            const newCommentText = commentTextarea.value.trim();
            if (newCommentText) {
                const invoiceData = allInvoicesData[currentEditingInvoiceId];
                let existingComments = invoiceData && Array.isArray(invoiceData.comment) ? invoiceData.comment : [];

                const newComment = {
                    text: newCommentText,
                    timestamp: new Date().toISOString()
                };

                const updatedComments = [...existingComments, newComment];
                // Call the new centralized function
                handleCommentUpdate(currentEditingInvoiceId, updatedComments);
                commentTextarea.value = ''; // Clear the textarea after saving
            } else {
                showStatusMessage('Comment cannot be empty.', 'error');
            }
        }
    });
    // Event listener for saving an edited comment
    commentModalSaveEditBtn.addEventListener('click', () => {
        if (currentEditingInvoiceId !== null && editingCommentIndex !== null) {
            const editedCommentText = commentTextarea.value.trim();
            if (editedCommentText) {
                const updatedComments = [...(allInvoicesData[currentEditingInvoiceId]?.comment || [])];
                if (updatedComments[editingCommentIndex]) {
                    updatedComments[editingCommentIndex].text = editedCommentText;
                    // Call the new centralized function
                    handleCommentUpdate(currentEditingInvoiceId, updatedComments);

                    // Reset modal to original state
                    commentModalSaveBtn.classList.remove('hidden');
                    commentModalSaveEditBtn.classList.add('hidden');
                    commentModalCancelEditBtn.classList.add('hidden');
                    editingCommentIndex = null;
                    commentTextarea.value = '';
                }
            } else {
                showStatusMessage('Comment cannot be empty.', 'error');
            }
        }
    });
    // Event listener for canceling an edit
    commentModalCancelEditBtn.addEventListener('click', () => {
        // Reset modal to original state
        commentModalSaveBtn.classList.remove('hidden');
        commentModalSaveEditBtn.classList.add('hidden');
        commentModalCancelEditBtn.classList.add('hidden');
        editingCommentIndex = null;
        commentTextarea.value = '';
    });

    commentModalOverlay.addEventListener('click', (event) => {
        if (event.target === commentModalOverlay) {
            commentModalOverlay.classList.add('hidden');
        }
    });

    // Initial fetch and render
    fetchDataWithRetry(`${firebaseBaseUrl}.json`)
        .then((data) => {
            if (data && Object.keys(data).length > 0) {
                allInvoicesData = data;
                // --- NEW: Use the global filters for the initial render ---
                renderInvoiceTable(allInvoicesData, currentFilters);
            } else if (data && Object.keys(data).length === 0) {
                dataContainer.innerHTML = `<p class="text-gray-600 text-center text-lg">No invoice data found in the database.</p>`;
            } else {
                dataContainer.innerHTML = `<p class="error-message text-center">Failed to load invoice data. Please verify the Firebase URL and your internet connection.</p>`;
            }
            filterInvoices()
        })
        .catch(error => {
            dataContainer.innerHTML = `<p class="error-message text-center">An unexpected error occurred while fetching data: ${error.message}</p>`;
            console.error('Critical error during data fetching process:', error);
        });
});