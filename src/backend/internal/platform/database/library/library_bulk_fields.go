package library

var backupFieldSpecs = map[string]map[string]string{
	"scene": {
		"title": "string", "description": "string", "lighting": "string", "category": "string",
		"spatialType": "string", "suitableCategories": "string", "tags": "string", "coverUrl": "string?",
		"sourceImages": "string?", "reversePrompt": "string?", "dimensions": "string?", "sourceImageIndex": "int?",
		"imageType": "string?", "provenance": "string", "usageCount": "int", "isFavorite": "bool",
		"albumId": "string?", "productCategoryIds": "string", "isUniversal": "bool",
	},
	"outfit": {
		"title": "string", "top": "string", "bottom": "string", "shoes": "string?", "colorPalette": "string?",
		"category": "string", "suitableCategories": "string", "tags": "string", "coverUrl": "string?",
		"sourceImages": "string?", "reversePrompt": "string?", "dimensions": "string?", "sourceImageIndex": "int?",
		"imageType": "string?", "provenance": "string", "usageCount": "int", "isFavorite": "bool",
		"albumId": "string?", "productCategoryIds": "string", "isUniversal": "bool",
	},
	"action": {
		"title": "string", "action": "string", "shotType": "string", "spatialType": "string", "camera": "string?",
		"suitableAnatomy": "string", "tags": "string", "coverUrl": "string?", "sourceImages": "string?",
		"reversePrompt": "string?", "dimensions": "string?", "sourceImageIndex": "int?", "imageType": "string?",
		"provenance": "string", "usageCount": "int", "isFavorite": "bool", "sceneId": "string?", "shotOrder": "int",
		"albumId": "string?", "productCategoryIds": "string", "isUniversal": "bool",
	},
	"persona": {
		"name": "string", "description": "string", "tags": "string", "avatarUrl": "string?", "reversePrompt": "string?",
		"sourceImages": "string?", "dimensions": "string?", "sourceImageIndex": "int?", "imageType": "string?",
		"provenance": "string", "usageCount": "int", "isFavorite": "bool", "albumId": "string?",
		"productCategoryIds": "string", "isUniversal": "bool",
	},
	"full_prompt": {
		"title": "string", "albumName": "string?", "reversePromptZh": "string", "reversePromptEn": "string?",
		"dimensions": "string?", "imageType": "string?", "sourceImageIndex": "int?", "sourceImageIndices": "string?",
		"groupIndex": "int?", "contentSummary": "string?", "architectureSummary": "string?", "replaceableSlots": "string?",
		"shotPromptsJson": "string?", "coverUrl": "string?", "sourceImages": "string?", "hasHuman": "bool",
		"shotFraming": "string?", "productFrameRatio": "int?", "sceneSummary": "string?", "outfitSummary": "string?",
		"actionSummary": "string?", "personaSummary": "string?", "tags": "string", "category": "string",
		"productSubcategory": "string?", "provenance": "string", "usageCount": "int", "isFavorite": "bool",
		"albumId": "string?", "productCategoryIds": "string", "isUniversal": "bool",
	},
}
