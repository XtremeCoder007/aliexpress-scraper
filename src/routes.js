// routes.js
const Apify = require('apify');
const Promise = require('bluebird');
const extractors = require('./extractors');

const {
    utils: { log },
} = Apify;


// Home page crawler.
// Checks user input and create category links
// Adds categories to request queue
exports.HOME = async ({ page, userInput, request }, { requestQueue }) => {
    const { startPage = 0, categoryStartIndex = 0, categoryEndIndex = null } = userInput;

    log.info('CRAWLER -- Fetching Categories');

    // Extract all categories
    const mainCategoryPaths = await extractors.getAllMainCategoryPaths(page);

    // Get all subcategory links
    const subCategories = await extractors.getAllSubCategories(request.url, mainCategoryPaths, page);

    log.info(`CRAWLER -- Fetched total of ${subCategories.length} categories`);

    // Filter categories if needed
    const filteredSubCategories = extractors.filterSubCategories(categoryStartIndex, categoryEndIndex, subCategories);

    // Adding all subcategory links to queue
    for (const filteredSubCategory of filteredSubCategories) {
        await requestQueue.addRequest({
            url: filteredSubCategory,
            userData: {
                label: 'CATEGORY',
                pageNum: startPage || 1,
                categoryBaseURL: filteredSubCategory,
            },
        }, { forefront: true });
    }

    log.debug(`CRAWLER -- ${filteredSubCategories.length} categories added to queue`);
};


// Categoy page crawler
// Add next page on request queue
// Fetch products from list and add all links to request queue
exports.CATEGORY = async ({ page, userInput, request }, { requestQueue }) => {
    const { endPage = -1 } = userInput;
    const { pageNum = 1, categoryBaseURL } = request.userData;

    log.info(`CRAWLER -- Fetching category: ${request.url} with page: ${pageNum}`);

    // Extract product links
    const productLinks = await extractors.getProductsOfPage(page);

    // If products are more than 0
    if (productLinks.length > 0) {
        // Check user input
        if (endPage > 0 ? pageNum + 1 <= endPage : true) {
            // Add next page of same category to queue
            await requestQueue.addRequest({
                url: `${categoryBaseURL}?page=${pageNum + 1}`,
                userData: {
                    label: 'CATEGORY',
                    pageNum: pageNum + 1,
                    categoryBaseURL,
                },
            }, { forefront: true });
        }


        // Add all products to request queue
        for (const productLink of productLinks) {
            await requestQueue.addRequest({
                uniqueKey: `${productLink.id}`,
                url: `https:${productLink.link}`,
                userData: {
                    label: 'PRODUCT',
                    productId: productLink.id,
                },
            });
        }
    } else {
        // End of category with page
        log.debug(`CRAWLER -- Last page of category: ${request.url} with page: ${pageNum}.`);
    }


    log.debug(`CRAWLER -- Fetched product links from ${request.url} with page: ${pageNum}`);
};


// Product page crawler
// Fetches product detail from detail page
exports.PRODUCT = async ({ page, userInput, request }, { requestQueue }) => {
    const { productId } = request.userData;

    log.info(`CRAWLER -- Fetching product: ${productId}`);

    // Fetch product details
    const product = await extractors.getProductDetail(page);


    // Fetch description
    product.description = await extractors.getProductDescription(product.descriptionURL, page);
    delete product.descriptionURL;

    // Fetch Recommendations
    // product.recommendations = await extractors.getProductRecommendations(userInput, request.url);

    // Fetch similar products
    // product.similarProducts = https://gpsfront.aliexpress.com/getI2iRecommendingResults.do?currentItemList=4000016604997&categoryId=200001411&shopId=2534028&companyId=237380546&recommendType=toOtherSeller&scenario=pcDetailBottomMoreOtherSeller&limit=30&offset=0&callback=__zoro_request_4

    // Delay in random
    // await Promise.delay(Math.random() * 5000);

    // Get Feedbacks
    product.feedbacks = await extractors.getProductFeedbacks(userInput, product.id, request.url, product.companyId, product.memberId);
    delete product.companyId;
    delete product.memberId;

    console.log(product.feedbacks);
    // Fetch questions
    // product.questions = https://www.aliexpress.com/aeglodetailweb/api/questions?productId=4000016604997&currentPage=1&pageSize=5 WITH REFERRER of past page

    // Push data
    // await Apify.pushData({ ...product, description });

    log.debug(`CRAWLER -- Fetching product: ${productId} completed and successfully pushed to dataset`);
};
