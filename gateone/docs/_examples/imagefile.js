var ImageFile = function( url ) {
    /**class:ImageFile( url )

    A container for an image file.
        >>> var img = new ImageFile( "_static/jdoctest.png" );
        >>> img.url;
        '_static/jdoctest.png'
    */
    this.url = String( url );
};
ImageFile.prototype = {
    fetchData: function() {
        /**:ImageFile.prototype.fetchData()

        Request to the server to get data of this image file. When the
        request done we can get ``size`` or ``modified`` attribute.

            >>> img.fetchData();
            >>> wait(function() { return img.data; });
            >>> img.size;
            21618
            >>> img.modified; //doctest: +SKIP
            Sat Sep 25 2010 19:57:47 GMT+0900 (KST)
        */
        $.get( this.url, function( data ) {
            this.data = data;
            this.size = data.length;
            this.modified = new Date(); // Not Implemented Yet
        });
    }
};