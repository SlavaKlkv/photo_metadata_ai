from app.core.enums import StockPlatform

DEFAULT_STOCK_CATEGORIES: dict[StockPlatform, str] = {
    StockPlatform.GETTY_IMAGES: 'Creative',
    StockPlatform.SHUTTERSTOCK: 'Objects',
    StockPlatform.ADOBE_STOCK: 'Lifestyle',
}

CATEGORY_ALIASES: dict[str, dict[StockPlatform, str]] = {
    'abstract': {
        StockPlatform.GETTY_IMAGES: 'Creative',
        StockPlatform.SHUTTERSTOCK: 'Abstract',
        StockPlatform.ADOBE_STOCK: 'Graphic Resources',
    },
    'animals': {
        StockPlatform.GETTY_IMAGES: 'Nature',
        StockPlatform.SHUTTERSTOCK: 'Animals/Wildlife',
        StockPlatform.ADOBE_STOCK: 'Animals',
    },
    'wildlife': {
        StockPlatform.GETTY_IMAGES: 'Nature',
        StockPlatform.SHUTTERSTOCK: 'Animals/Wildlife',
        StockPlatform.ADOBE_STOCK: 'Animals',
    },
    'architecture': {
        StockPlatform.GETTY_IMAGES: 'Travel',
        StockPlatform.SHUTTERSTOCK: 'Buildings/Landmarks',
        StockPlatform.ADOBE_STOCK: 'Buildings and Architecture',
    },
    'buildings': {
        StockPlatform.GETTY_IMAGES: 'Travel',
        StockPlatform.SHUTTERSTOCK: 'Buildings/Landmarks',
        StockPlatform.ADOBE_STOCK: 'Buildings and Architecture',
    },
    'business': {
        StockPlatform.GETTY_IMAGES: 'Business',
        StockPlatform.SHUTTERSTOCK: 'Business/Finance',
        StockPlatform.ADOBE_STOCK: 'Business',
    },
    'finance': {
        StockPlatform.GETTY_IMAGES: 'Business',
        StockPlatform.SHUTTERSTOCK: 'Business/Finance',
        StockPlatform.ADOBE_STOCK: 'Business',
    },
    'food': {
        StockPlatform.GETTY_IMAGES: 'Food',
        StockPlatform.SHUTTERSTOCK: 'Food and Drink',
        StockPlatform.ADOBE_STOCK: 'Food',
    },
    'drink': {
        StockPlatform.GETTY_IMAGES: 'Food',
        StockPlatform.SHUTTERSTOCK: 'Food and Drink',
        StockPlatform.ADOBE_STOCK: 'Drinks',
    },
    'healthcare': {
        StockPlatform.GETTY_IMAGES: 'Healthcare',
        StockPlatform.SHUTTERSTOCK: 'Healthcare/Medical',
        StockPlatform.ADOBE_STOCK: 'Social Issues',
    },
    'medical': {
        StockPlatform.GETTY_IMAGES: 'Healthcare',
        StockPlatform.SHUTTERSTOCK: 'Healthcare/Medical',
        StockPlatform.ADOBE_STOCK: 'Science',
    },
    'nature': {
        StockPlatform.GETTY_IMAGES: 'Nature',
        StockPlatform.SHUTTERSTOCK: 'Nature',
        StockPlatform.ADOBE_STOCK: 'Landscape',
    },
    'landscape': {
        StockPlatform.GETTY_IMAGES: 'Nature',
        StockPlatform.SHUTTERSTOCK: 'Nature',
        StockPlatform.ADOBE_STOCK: 'Landscape',
    },
    'environment': {
        StockPlatform.GETTY_IMAGES: 'Nature',
        StockPlatform.SHUTTERSTOCK: 'Nature',
        StockPlatform.ADOBE_STOCK: 'The Environment',
    },
    'plants': {
        StockPlatform.GETTY_IMAGES: 'Nature',
        StockPlatform.SHUTTERSTOCK: 'Nature',
        StockPlatform.ADOBE_STOCK: 'Plants and Flowers',
    },
    'flowers': {
        StockPlatform.GETTY_IMAGES: 'Nature',
        StockPlatform.SHUTTERSTOCK: 'Nature',
        StockPlatform.ADOBE_STOCK: 'Plants and Flowers',
    },
    'people': {
        StockPlatform.GETTY_IMAGES: 'Lifestyle',
        StockPlatform.SHUTTERSTOCK: 'People',
        StockPlatform.ADOBE_STOCK: 'People',
    },
    'lifestyle': {
        StockPlatform.GETTY_IMAGES: 'Lifestyle',
        StockPlatform.SHUTTERSTOCK: 'People',
        StockPlatform.ADOBE_STOCK: 'Lifestyle',
    },
    'fashion': {
        StockPlatform.GETTY_IMAGES: 'Lifestyle',
        StockPlatform.SHUTTERSTOCK: 'Beauty/Fashion',
        StockPlatform.ADOBE_STOCK: 'People',
    },
    'beauty': {
        StockPlatform.GETTY_IMAGES: 'Lifestyle',
        StockPlatform.SHUTTERSTOCK: 'Beauty/Fashion',
        StockPlatform.ADOBE_STOCK: 'People',
    },
    'sport': {
        StockPlatform.GETTY_IMAGES: 'Sport',
        StockPlatform.SHUTTERSTOCK: 'Sports/Recreation',
        StockPlatform.ADOBE_STOCK: 'Sports',
    },
    'sports': {
        StockPlatform.GETTY_IMAGES: 'Sport',
        StockPlatform.SHUTTERSTOCK: 'Sports/Recreation',
        StockPlatform.ADOBE_STOCK: 'Sports',
    },
    'technology': {
        StockPlatform.GETTY_IMAGES: 'Technology',
        StockPlatform.SHUTTERSTOCK: 'Technology',
        StockPlatform.ADOBE_STOCK: 'Technology',
    },
    'transport': {
        StockPlatform.GETTY_IMAGES: 'Travel',
        StockPlatform.SHUTTERSTOCK: 'Transportation',
        StockPlatform.ADOBE_STOCK: 'Transport',
    },
    'transportation': {
        StockPlatform.GETTY_IMAGES: 'Travel',
        StockPlatform.SHUTTERSTOCK: 'Transportation',
        StockPlatform.ADOBE_STOCK: 'Transport',
    },
    'travel': {
        StockPlatform.GETTY_IMAGES: 'Travel',
        StockPlatform.SHUTTERSTOCK: 'Transportation',
        StockPlatform.ADOBE_STOCK: 'Travel',
    },
    'education': {
        StockPlatform.GETTY_IMAGES: 'Lifestyle',
        StockPlatform.SHUTTERSTOCK: 'Education',
        StockPlatform.ADOBE_STOCK: 'Lifestyle',
    },
    'science': {
        StockPlatform.GETTY_IMAGES: 'Technology',
        StockPlatform.SHUTTERSTOCK: 'Science',
        StockPlatform.ADOBE_STOCK: 'Science',
    },
    'objects': {
        StockPlatform.GETTY_IMAGES: 'Creative',
        StockPlatform.SHUTTERSTOCK: 'Objects',
        StockPlatform.ADOBE_STOCK: 'Graphic Resources',
    },
    'background': {
        StockPlatform.GETTY_IMAGES: 'Creative',
        StockPlatform.SHUTTERSTOCK: 'Backgrounds/Textures',
        StockPlatform.ADOBE_STOCK: 'Graphic Resources',
    },
    'texture': {
        StockPlatform.GETTY_IMAGES: 'Creative',
        StockPlatform.SHUTTERSTOCK: 'Backgrounds/Textures',
        StockPlatform.ADOBE_STOCK: 'Graphic Resources',
    },
    'art': {
        StockPlatform.GETTY_IMAGES: 'Creative',
        StockPlatform.SHUTTERSTOCK: 'Arts',
        StockPlatform.ADOBE_STOCK: 'Graphic Resources',
    },
    'graphic': {
        StockPlatform.GETTY_IMAGES: 'Creative',
        StockPlatform.SHUTTERSTOCK: 'Arts',
        StockPlatform.ADOBE_STOCK: 'Graphic Resources',
    },
    'culture': {
        StockPlatform.GETTY_IMAGES: 'Lifestyle',
        StockPlatform.SHUTTERSTOCK: 'Religion',
        StockPlatform.ADOBE_STOCK: 'Culture and Religion',
    },
    'religion': {
        StockPlatform.GETTY_IMAGES: 'Lifestyle',
        StockPlatform.SHUTTERSTOCK: 'Religion',
        StockPlatform.ADOBE_STOCK: 'Culture and Religion',
    },
    'holiday': {
        StockPlatform.GETTY_IMAGES: 'Lifestyle',
        StockPlatform.SHUTTERSTOCK: 'Holidays',
        StockPlatform.ADOBE_STOCK: 'Culture and Religion',
    },
    'industrial': {
        StockPlatform.GETTY_IMAGES: 'Business',
        StockPlatform.SHUTTERSTOCK: 'Industrial',
        StockPlatform.ADOBE_STOCK: 'Industry',
    },
    'industry': {
        StockPlatform.GETTY_IMAGES: 'Business',
        StockPlatform.SHUTTERSTOCK: 'Industrial',
        StockPlatform.ADOBE_STOCK: 'Industry',
    },
}

LICENSE_ALIASES: dict[str, dict[StockPlatform, str]] = {
    'commercial': {
        StockPlatform.GETTY_IMAGES: 'creative',
        StockPlatform.SHUTTERSTOCK: 'commercial',
        StockPlatform.ADOBE_STOCK: 'standard',
    },
    'creative': {
        StockPlatform.GETTY_IMAGES: 'creative',
        StockPlatform.SHUTTERSTOCK: 'commercial',
        StockPlatform.ADOBE_STOCK: 'standard',
    },
    'standard': {
        StockPlatform.GETTY_IMAGES: 'creative',
        StockPlatform.SHUTTERSTOCK: 'commercial',
        StockPlatform.ADOBE_STOCK: 'standard',
    },
    'extended': {
        StockPlatform.GETTY_IMAGES: 'creative',
        StockPlatform.SHUTTERSTOCK: 'commercial',
        StockPlatform.ADOBE_STOCK: 'extended',
    },
    'royalty free': {
        StockPlatform.GETTY_IMAGES: 'creative',
        StockPlatform.SHUTTERSTOCK: 'commercial',
        StockPlatform.ADOBE_STOCK: 'standard',
    },
    'editorial': {
        StockPlatform.GETTY_IMAGES: 'editorial',
        StockPlatform.SHUTTERSTOCK: 'editorial',
        StockPlatform.ADOBE_STOCK: 'editorial',
    },
}
