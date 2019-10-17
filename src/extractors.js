const Apify = require('apify');
const axios = require('axios');
const uniqBy = require('lodash/uniqBy');
const cheerio = require('cheerio');
const safeEval = require('safe-eval');

// Fetch all main category paths from homepage
const getAllMainCategoryPaths = ($) => {
    return $('dd.sub-cate').map((i, el) => $(el).data('path')).get();
};

// Fetch every subcategory hidden pages (loaders)
const getAllSubCategories = async (base, mainCategoryPaths) => {
    let subCategories = [];

    // Fetch all subcategories
    for (const categoryPath of mainCategoryPaths) {
        // Fetch subcategory page
        const { data } = await axios.get(
            `${base}/api/load_ams_path.htm?path=aliexpress.com/common/@langField/ru/${categoryPath}.htm`,
            {
                headers: {
                    Connection: 'keep-alive',
                    'User-Agent': Apify.utils.getRandomUserAgent(),
                },
                timeout: 0,
                rejectUnauthorized: false,
            },
        );

        // Load to cheerio
        const temp$ = cheerio.load(data);

        // Fetch links
        subCategories = subCategories
            .concat(temp$('a')
                .map((i, el) => temp$(el).attr('href').split('?')[0]).get()
                .filter(link => /\/category\//.test(link)));
    }

    return uniqBy(subCategories);
};

// Filters sub categories with given options
const filterSubCategories = (categoryStartIndex = 0, categoryEndIndex = null, subCategories) => {
    // Calculate end index
    const endIndex = categoryEndIndex > 0 ? categoryEndIndex : subCategories.length - 1;

    // Slice array
    return subCategories.slice(categoryStartIndex, endIndex);
};

// Fetch all products from a global object `runParams`
const getProductsOfPage = ($) => {
    const dataScript = $($('script').filter((i, script) => $(script).html().includes('runParams')).get()[0]).html();

    return JSON.parse(
        dataScript.split('window.runParams = ')[2].split('window.runParams.csrfToken =')[0].replace(/;/g, ''),
    ).items.map(item => ({ id: item.productId, name: item.title, link: item.productDetailUrl }));
};

// Fetch basic product detail from a global object `runParams`
const getProductDetail = ($, url) => {
    const dataScript = $($('script').filter((i, script) => $(script).html().includes('runParams')).get()[0]).html();

    const { data } = safeEval(dataScript.split('window.runParams = ')[1].split('var GaData')[0].replace(/;/g, ''));

    const {
        actionModule,
        titleModule,
        storeModule,
        specsModule,
        imageModule,
        descriptionModule,
        skuModule,
        crossLinkModule,
        recommendModule,
        commonModule,
    } = data;


    return {
        id: actionModule.productId,
        link: url,
        title: titleModule.subject,
        tradeAmount: `${titleModule.tradeCount ? titleModule.tradeCount : ''} ${titleModule.tradeCountUnit ? titleModule.tradeCountUnit : ''}`,
        averageStar: titleModule.feedbackRating.averageStar,
        descriptionURL: descriptionModule.descriptionUrl,
        store: {
            followingNumber: storeModule.followingNumber,
            establishedAt: storeModule.openTime,
            positiveNum: storeModule.positiveNum,
            positiveRate: storeModule.positiveRate,
            name: storeModule.storeName,
            id: storeModule.storeNum,
            url: `https:${storeModule.storeURL}`,
            topRatedSeller: storeModule.topRatedSeller,
        },
        specs: specsModule.props.map((spec) => {
            const obj = {};
            obj[spec.attrName] = spec.attrValue;
            return obj;
        }),
        categories: crossLinkModule.breadCrumbPathList
            .map(breadcrumb => breadcrumb.target)
            .filter(breadcrumb => breadcrumb),
        wishedCount: actionModule.itemWishedCount,
        quantity: actionModule.totalAvailQuantity,
        photos: imageModule.imagePathList,
        skuOptions: skuModule.productSKUPropertyList ? skuModule.productSKUPropertyList
            .map(skuOption => ({
                name: skuOption.skuPropertyName,
                values: skuOption.skuPropertyValues
                    .map(skuPropVal => skuPropVal.propertyValueDefinitionName),
            })) : [],
        prices: skuModule.skuPriceList.map(skuPriceItem => ({
            price: skuPriceItem.skuVal.skuAmount.formatedAmount,
            attributes: skuPriceItem.skuPropIds.split(',')
                .map(propId => (skuModule.productSKUPropertyList ? skuModule.productSKUPropertyList
                    .reduce((arr, obj) => { return arr.concat(obj.skuPropertyValues); }, [])
                    .find(propVal => propVal.propertyValueId === parseInt(propId, 10)).propertyValueName : null)),
        })),
        companyId: recommendModule.companyId,
        memberId: commonModule.sellerAdminSeq,
    };
};


// Get description HTML of product
const getProductDescription = async ($) => {
    return $.html();
};


module.exports = {
    getAllMainCategoryPaths,
    getAllSubCategories,
    filterSubCategories,
    getProductsOfPage,
    getProductDetail,
    getProductDescription,
};
