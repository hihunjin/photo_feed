* avoid duplicated photos.
  * make a hash table of the image.
  * everytime upload photo, check the hash table.
  * if there's same hash, don't upload.
  * but the feed should look at the file. so we can see the photo in two(or more) different feed.
  * this logic works also on different band.