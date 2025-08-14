#!/usr/bin/env python3
"""
Process the xComfort Bridge reference image to create Homey app store images
Creates three sizes: 250x175, 500x350, 1000x700
"""

from PIL import Image
import os

def create_app_images():
    # The image should be saved as 'xcomfort_reference.jpg' in this directory
    input_file = 'xcomfort_reference.jpg'
    
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found. Please save the provided image as '{input_file}'")
        return
    
    # Open the original image
    try:
        img = Image.open(input_file)
        print(f"Loaded image: {img.size}")
        
        # Define the target sizes for Homey app images
        sizes = [
            (250, 175, 'small.jpg'),
            (500, 350, 'medium.jpg'), 
            (1000, 700, 'large.jpg')
        ]
        
        for width, height, filename in sizes:
            # Calculate aspect ratio
            target_ratio = width / height
            original_ratio = img.width / img.height
            
            if original_ratio > target_ratio:
                # Image is wider, crop from sides
                new_height = img.height
                new_width = int(new_height * target_ratio)
                left = (img.width - new_width) // 2
                top = 0
                right = left + new_width
                bottom = img.height
            else:
                # Image is taller, crop from top/bottom
                new_width = img.width
                new_height = int(new_width / target_ratio)
                left = 0
                top = (img.height - new_height) // 2
                right = img.width
                bottom = top + new_height
            
            # Crop and resize
            cropped = img.crop((left, top, right, bottom))
            resized = cropped.resize((width, height), Image.Resampling.LANCZOS)
            
            # Save with high quality
            resized.save(filename, 'JPEG', quality=95, optimize=True)
            print(f"Created {filename} ({width}x{height})")
            
        print("\nAll app images created successfully!")
        print("Files created:")
        for _, _, filename in sizes:
            if os.path.exists(filename):
                size = os.path.getsize(filename)
                print(f"  {filename}: {size} bytes")
                
    except Exception as e:
        print(f"Error processing image: {e}")

if __name__ == "__main__":
    create_app_images()
